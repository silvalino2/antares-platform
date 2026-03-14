require("dotenv").config();
const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const session    = require("express-session");
const cors       = require("cors");
const bodyParser = require("body-parser");
const path       = require("path");

const app        = express();
const httpServer = http.createServer(app);
const io         = new Server(httpServer, { cors:{ origin:"*" } });

app.set("io", io);
app.use(cors());
app.use(bodyParser.urlencoded({ extended:false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(session({ secret:process.env.SESSION_SECRET||"antares_v3", resave:false, saveUninitialized:false, cookie:{ secure:false, maxAge:86400000 } }));

app.use("/twilio",      require("./routes/twilio"));
app.use("/api/admin",   require("./routes/admin"));
app.use("/api/client",  require("./routes/client"));

app.get("/",          (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
app.get("/admin",     (req,res) => res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("/dashboard", (req,res) => res.sendFile(path.join(__dirname,"public","dashboard.html")));
app.get("/health",    (req,res) => res.json({ status:"live", platform:"Antares v3", time:new Date() }));

io.on("connection", socket => {
  socket.on("join", id => socket.join(id));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`\n✦  ANTARES Platform v3`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Admin: http://localhost:${PORT}/admin\n`);
});
