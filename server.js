const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

// Channel list
const channels = {
  "1": "https://mumt02.tangotv.in/MATHRUBHUMINEWS/index.m3u8"
};

app.get("/:id/:file?", (req, res) => {
  const id = req.params.id;
  const requestFile = req.params.file;

  if (!channels[id]) {
    return res.status(400).send("Invalid channel ID");
  }

  const inputUrl = channels[id];
  const tmpDir = path.join(__dirname, id);
  const m3u8File = path.join(tmpDir, "stream.m3u8");
  const lockFile = path.join(tmpDir, "lock");

  // Create folder
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // Start FFmpeg if needed
  const now = Date.now();
  let shouldStart = false;

  if (!fs.existsSync(m3u8File)) {
    shouldStart = true;
  } else if (!fs.existsSync(lockFile)) {
    shouldStart = true;
  } else {
    const last = fs.statSync(lockFile).mtimeMs;
    if ((now - last) / 1000 > 20) {
      shouldStart = true;
    }
  }

  if (shouldStart) {
    const cmd = `ffmpeg -loglevel error -y \
-headers "Referer: https://tangotv.in\\r\\nUser-Agent: Mozilla/5.0\\r\\n" \
-i "${inputUrl}" \
-c copy \
-f hls -hls_time 2 -hls_list_size 4 \
-hls_flags delete_segments+append_list+omit_endlist \
-hls_segment_filename "${tmpDir}/seg_%03d.ts" \
"${m3u8File}" > "${tmpDir}/log.txt" 2>&1 &`;

    exec(cmd);
    fs.writeFileSync(lockFile, String(Date.now()));
  }

  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Serve requested file
  if (requestFile) {
    const filePath = path.join(tmpDir, requestFile);

    if (fs.existsSync(filePath)) {
      if (requestFile.endsWith(".ts")) {
        res.setHeader("Content-Type", "video/MP2T");
      } else if (requestFile.endsWith(".m3u8")) {
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      }
      return fs.createReadStream(filePath).pipe(res);
    }
  }

  // Default playlist
  if (fs.existsSync(m3u8File)) {
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    return fs.createReadStream(m3u8File).pipe(res);
  }

  // Fallback
  res.status(503).send("#EXTM3U\n#EXTINF:-1,Starting stream...");
});

// Start server
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
