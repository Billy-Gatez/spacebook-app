const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const mongoose = require("mongoose");
const multer = require("multer");

// ====== CLOUDINARY ======
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

// ====== APP ======
const app = express();

// ====== CONFIG ======
const MONGO_URI = "mongodb+srv://jercahill:Spacebook2026@spacebook.mpqjbcv.mongodb.net/spacebook?retryWrites=true&w=majority";
const PORT = process.env.PORT || 3000;

// ====== CLOUDINARY CONFIG ======
cloudinary.config({
  cloud_name: "dswjf3yeo",
  api_key: "623674686576159",
  api_secret: "sPxP8lqOyPn_FU6o1Be20BrBdfM"
});

// ====== DB SETUP ======
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("Mongo error", err));

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  birthday: String,
  network: String,
  profilePic: String,
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  topFriends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
});

const postSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  userName: String,
  content: String,
  imagePath: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Post = mongoose.model("Post", postSchema);

// ====== MIDDLEWARE ======
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
  secret: "spacebook-secret",
  resave: false,
  saveUninitialized: false
}));

app.use(express.static(path.join(__dirname, "public")));

// ====== CLOUDINARY MULTER STORAGE ======
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "spacebook",
    allowed_formats: ["jpg", "jpeg", "png", "gif"]
  }
});

const upload = multer({ storage });

// ====== AUTH GUARD ======
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect("/");
  next();
}

// ====== ROUTES ======

// Landing
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Signup page
app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "signup.html"));
});

// Signup handler
app.post("/signup", async (req, res) => {
  const { name, email, password, birthday, network } = req.body;
  try {
    const existing = await User.findOne({ email });
    if (existing) return res.send("User already exists. <a href='/'>Log in</a>");

    const user = await User.create({ name, email, password, birthday, network });
    req.session.userId = user._id;
    res.redirect("/feed");
  } catch (err) {
    console.error(err);
    res.send("Error creating user.");
  }
});

// Login handler
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, password });
  if (!user) return res.send("Invalid credentials. <a href='/'>Try again</a>");

  req.session.userId = user._id;
  res.redirect("/feed");
});

// Home (static shell)
app.get("/home", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

// Create post (with optional image)
app.post("/post", requireLogin, upload.single("image"), async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) return res.redirect("/");

  const imagePath = req.file ? req.file.path : null;

  await Post.create({
    userId: user._id,
    userName: user.name,
    content: req.body.content,
    imagePath
  });

  res.redirect("/feed");
});

// Personalized feed (friends + self)
app.get("/feed", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId).populate("friends");
  const friendIds = user.friends.map(f => f._id);
  friendIds.push(user._id);

  const posts = await Post.find({ userId: { $in: friendIds } }).sort({ createdAt: -1 });

  const htmlPosts = posts.map(p => `
    <div class="post">
      <div class="author">${p.userName}</div>
      <div class="meta">${p.createdAt.toLocaleString()}</div>
      <p style="margin-top:6px;">${p.content || ""}</p>
      ${p.imagePath ? `<img src="${p.imagePath}" style="max-width:100%; margin-top:8px; border-radius:6px;">` : ""}
    </div>
  `).join("");

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Feed – Spacebook</title>
      <link rel="stylesheet" href="/assets/css/styles.css">
    </head>
    <body>
      <div class="navbar">
        <div class="logo"><a href="/feed" style="color:#ff6a00;">Spacebook</a></div>
        <div class="nav-links">
          <a href="/home">Home</a>
          <a href="/profile">Profile</a>
          <a href="/logout">Log Out</a>
        </div>
      </div>

      <div class="page">
        <aside class="sidebar">
          <div class="card">
            <strong style="color:#ff6a00;">Navigation</strong>
            <ul style="list-style:none; margin-top:10px; font-size:14px;">
              <li><a href="/profile">Your Profile</a></li>
              <li><a href="/feed">Feed</a></li>
              <li><a href="#">Messages</a></li>
              <li><a href="#">Friends</a></li>
              <li><a href="#">Groups</a></li>
            </ul>
          </div>
        </aside>

        <main class="feed">
          <div class="card">
            <form action="/post" method="post" enctype="multipart/form-data">
              <textarea name="content" placeholder="What’s happening in your universe?"></textarea>
              <label style="color:#ccc; font-size:14px; margin-top:6px; display:block;">
                Upload an image (optional)
              </label>
              <input type="file" name="image" accept="image/*">
              <button class="btn-primary" style="margin-top:10px;">Post</button>
            </form>
          </div>

          <div class="card" style="margin-top:20px;">
            ${htmlPosts || "<p>No posts yet.</p>"}
          </div>
        </main>
      </div>
    </body>
    </html>
  `);
});

// Upload profile picture
app.post("/upload-profile-pic", requireLogin, upload.single("profilePic"), async (req, res) => {
  if (!req.file) return res.redirect("/profile");

  const user = await User.findById(req.session.userId);
  user.profilePic = req.file.path;
  await user.save();

  res.redirect("/profile");
});

// Set top friends (Top 8)
app.post("/set-top-friends", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  let selected = req.body.topFriends || [];
  if (!Array.isArray(selected)) selected = [selected];
  // enforce max 8
  user.topFriends = selected.slice(0, 8);
  await user.save();
  res.redirect("/profile");
});

// Add friend
app.post("/add-friend/:id", requireLogin, async (req, res) => {
  const viewer = await User.findById(req.session.userId);
  const target = await User.findById(req.params.id);
  if (!viewer || !target) return res.redirect("/feed");

  if (!viewer.friends.some(f => f.toString() === target._id.toString())) {
    viewer.friends.push(target._id);
    await viewer.save();
  }

  res.redirect("/profile/" + target._id);
});

// Remove friend
app.post("/remove-friend/:id", requireLogin, async (req, res) => {
  const viewer = await User.findById(req.session.userId);
  if (!viewer) return res.redirect("/feed");

  viewer.friends = viewer.friends.filter(f => f.toString() !== req.params.id);
  viewer.topFriends = viewer.topFriends.filter(f => f.toString() !== req.params.id);
  await viewer.save();

  res.redirect("/profile/" + req.params.id);
});

// Your own profile (dynamic)
app.get("/profile", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId)
    .populate("friends")
    .populate("topFriends");

  const posts = await Post.find({ userId: user._id }).sort({ createdAt: -1 });

  const topFriendsHtml = (user.topFriends || []).map(f => `
    <div class="friend-tile">
      <div class="friend-avatar" style="
        width:60px; height:60px; border-radius:8px;
        background:#111 url('${f.profilePic || "/assets/img/default-avatar.png"}') center/cover no-repeat;
        margin-bottom:4px;
      "></div>
      <div style="font-size:12px;">${f.name}</div>
    </div>
  `).join("");

  const friendsGridHtml = (user.friends || []).map(f => `
    <div class="friend-tile">
      <div class="friend-avatar" style="
        width:60px; height:60px; border-radius:8px;
        background:#111 url('${f.profilePic || "/assets/img/default-avatar.png"}') center/cover no-repeat;
        margin-bottom:4px;
      "></div>
      <div style="font-size:12px;"><a href="/profile/${f._id}" style="color:#ff6a00;">${f.name}</a></div>
    </div>
  `).join("");

  const postsHtml = posts.map(p => `
    <div class="post">
      <div class="author">${p.userName}</div>
      <div class="meta">${p.createdAt.toLocaleString()}</div>
      <p style="margin-top:6px;">${p.content || ""}</p>
      ${p.imagePath ? `<img src="${p.imagePath}" style="max-width:100%; margin-top:8px; border-radius:6px;">` : ""}
    </div>
  `).join("");

  const topFriendsSelector = (user.friends || []).map(f => `
    <label style="display:block; font-size:13px; margin-bottom:4px;">
      <input type="checkbox" name="topFriends" value="${f._id}"
        ${user.topFriends.some(tf => tf._id.toString() === f._id.toString()) ? "checked" : ""}>
      ${f.name}
    </label>
  `).join("");

  const pic = user.profilePic || "/assets/img/default-avatar.png";

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Profile – Spacebook</title>
      <link rel="stylesheet" href="/assets/css/styles.css">
      <style>
        .top-friends-bar {
          display:flex;
          flex-wrap:wrap;
          gap:10px;
        }
        .friend-tile {
          width:70px;
          text-align:center;
        }
      </style>
    </head>
    <body>
      <div class="navbar">
        <div class="logo">
          <a href="/feed" style="color:#ff6a00; text-decoration:none;">Spacebook</a>
        </div>
        <div class="nav-links">
          <a href="/home">Home</a>
          <a href="/feed">Feed</a>
          <a href="/logout">Log Out</a>
        </div>
      </div>

      <div class="page">
        <div class="card" style="width:100%;">

          <div class="profile-header">
            <div class="profile-avatar"
                 style="background-image:url('${pic}'); background-size:cover; background-position:center;">
            </div>

            <div class="profile-info">
              <h2>${user.name}</h2>
              <p>${user.network || "Unknown network"}</p>
              <p style="margin-top:6px; color:#ccc;">
                “Exploring the universe via Spacebook.”
              </p>
            </div>
          </div>

          <form action="/upload-profile-pic" method="post" enctype="multipart/form-data" style="margin-top:20px;">
            <label style="color:#ccc; font-size:14px;">Update profile picture</label>
            <input type="file" name="profilePic" accept="image/*">
            <button class="btn-primary" style="margin-top:10px;">Upload</button>
          </form>

          <hr style="margin:20px 0; border:none; border-top:1px solid #333;">

          <h3 style="color:#ff6a00; margin-bottom:10px;">Top Friends</h3>
          <div class="top-friends-bar">
            ${topFriendsHtml || "<p style='color:#ccc; font-size:13px;'>No top friends yet. Pick some below.</p>"}
          </div>

          <hr style="margin:20px 0; border:none; border-top:1px solid #333;">

          <h3 style="color:#ff6a00; margin-bottom:10px;">Your Friends</h3>
          <div style="display:flex; flex-wrap:wrap; gap:10px;">
            ${friendsGridHtml || "<p style='color:#ccc; font-size:13px;'>No friends yet.</p>"}
          </div>

          <form action="/set-top-friends" method="post" style="margin-top:20px;">
            <h4 style="color:#ff6a00; margin-bottom:8px;">Select Top 8 Friends</h4>
            <div style="max-height:200px; overflow-y:auto; border:1px solid #333; padding:10px; border-radius:6px;">
              ${topFriendsSelector || "<p style='color:#ccc; font-size:13px;'>Add some friends first.</p>"}
            </div>
            <button class="btn-primary" style="margin-top:10px;">Save Top Friends</button>
          </form>

          <hr style="margin:20px 0; border:none; border-top:1px solid #333;">

          <h3 style="color:#ff6a00; margin-bottom:10px;">Your Posts</h3>
          ${postsHtml || "<p style='color:#ccc; font-size:13px;'>You haven't posted yet.</p>"}

        </div>
      </div>
    </body>
    </html>
  `);
});

// Other user's profile
app.get("/profile/:id", requireLogin, async (req, res) => {
  const viewer = await User.findById(req.session.userId)
    .populate("friends")
    .populate("topFriends");
  const target = await User.findById(req.params.id)
    .populate("friends")
    .populate("topFriends");

  if (!target) return res.redirect("/feed");

  const posts = await Post.find({ userId: target._id }).sort({ createdAt: -1 });

  const isFriend = viewer.friends.some(f => f._id.toString() === target._id.toString());

  const topFriendsHtml = (target.topFriends || []).map(f => `
    <div class="friend-tile">
      <div class="friend-avatar" style="
        width:60px; height:60px; border-radius:8px;
        background:#111 url('${f.profilePic || "/assets/img/default-avatar.png"}') center/cover no-repeat;
        margin-bottom:4px;
      "></div>
      <div style="font-size:12px;">${f.name}</div>
    </div>
  `).join("");

  const friendsGridHtml = (target.friends || []).map(f => `
    <div class="friend-tile">
      <div class="friend-avatar" style="
        width:60px; height:60px; border-radius:8px;
        background:#111 url('${f.profilePic || "/assets/img/default-avatar.png"}') center/cover no-repeat;
        margin-bottom:4px;
      "></div>
      <div style="font-size:12px;"><a href="/profile/${f._id}" style="color:#ff6a00;">${f.name}</a></div>
    </div>
  `).join("");

  const postsHtml = posts.map(p => `
    <div class="post">
      <div class="author">${p.userName}</div>
      <div class="meta">${p.createdAt.toLocaleString()}</div>
      <p style="margin-top:6px;">${p.content || ""}</p>
      ${p.imagePath ? `<img src="${p.imagePath}" style="max-width:100%; margin-top:8px; border-radius:6px;">` : ""}
    </div>
  `).join("");

  const pic = target.profilePic || "/assets/img/default-avatar.png";

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${target.name} – Spacebook</title>
      <link rel="stylesheet" href="/assets/css/styles.css">
      <style>
        .top-friends-bar {
          display:flex;
          flex-wrap:wrap;
          gap:10px;
        }
        .friend-tile {
          width:70px;
          text-align:center;
        }
      </style>
    </head>
    <body>
      <div class="navbar">
        <div class="logo">
          <a href="/feed" style="color:#ff6a00; text-decoration:none;">Spacebook</a>
        </div>
        <div class="nav-links">
          <a href="/home">Home</a>
          <a href="/profile">Your Profile</a>
          <a href="/logout">Log Out</a>
        </div>
      </div>

      <div class="page">
        <div class="card" style="width:100%;">

          <div class="profile-header">
            <div class="profile-avatar"
                 style="background-image:url('${pic}'); background-size:cover; background-position:center;">
            </div>

            <div class="profile-info">
              <h2>${target.name}</h2>
              <p>${target.network || "Unknown network"}</p>
              <p style="margin-top:6px; color:#ccc;">
                “Exploring the universe via Spacebook.”
              </p>
            </div>
          </div>

          <div style="margin-top:10px;">
            ${isFriend ? `
              <form action="/remove-friend/${target._id}" method="post">
                <button class="btn-primary" style="background:#aa0000;">Remove Friend</button>
              </form>
            ` : `
              <form action="/add-friend/${target._id}" method="post">
                <button class="btn-primary">Add Friend</button>
              </form>
            `}
          </div>

          <hr style="margin:20px 0; border:none; border-top:1px solid #333;">

          <h3 style="color:#ff6a00; margin-bottom:10px;">Top Friends</h3>
          <div class="top-friends-bar">
            ${topFriendsHtml || "<p style='color:#ccc; font-size:13px;'>No top friends yet.</p>"}
          </div>

          <hr style="margin:20px 0; border:none; border-top:1px solid #333;">

          <h3 style="color:#ff6a00; margin-bottom:10px;">Friends</h3>
          <div style="display:flex; flex-wrap:wrap; gap:10px;">
            ${friendsGridHtml || "<p style='color:#ccc; font-size:13px;'>No friends yet.</p>"}
          </div>

          <hr style="margin:20px 0; border:none; border-top:1px solid #333;">

          <h3 style="color:#ff6a00; margin-bottom:10px;">Posts</h3>
          ${postsHtml || "<p style='color:#ccc; font-size:13px;'>No posts yet.</p>"}

        </div>
      </div>
    </body>
    </html>
  `);
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.listen(PORT, () => {
  console.log(`Spacebook running on port ${PORT}`);
});
