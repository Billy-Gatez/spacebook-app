const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const mongoose = require("mongoose");
const multer = require("multer");

const app = express();

// ====== CONFIG ======
const MONGO_URI = "mongodb://127.0.0.1:27017/spacebook"; // local MongoDB
const PORT = 3000;

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
  profilePic: String
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

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));

// ====== MULTER (IMAGE UPLOADS) ======
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
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

  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  await Post.create({
    userId: user._id,
    userName: user.name,
    content: req.body.content,
    imagePath
  });

  res.redirect("/feed");
});

// Feed (dynamic)
app.get("/feed", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  const posts = await Post.find().sort({ createdAt: -1 });

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
            </ul>
          </div>
        </aside>

        <main class="feed">
          <div class="card">
            <form action="/post" method="post" enctype="multipart/form-data">
              <textarea name="content" placeholder="What’s happening in your universe?"></textarea>
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
  user.profilePic = `/uploads/${req.file.filename}`;
  await user.save();

  res.redirect("/profile");
});

// Profile
app.get("/profile", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  const pic = user.profilePic || "/assets/img/default-avatar.png";

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Profile – Spacebook</title>
      <link rel="stylesheet" href="/assets/css/styles.css">
    </head>
    <body>
      <div class="navbar">
        <div class="logo"><a href="/feed" style="color:#ff6a00;">Spacebook</a></div>
        <div class="nav-links">
          <a href="/feed">Home</a>
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
  console.log(`Spacebook running at http://localhost:${PORT}`);
});
