import express from "express";
import dotenv from "dotenv";
import ytcore from "ytdl-core";
dotenv.config();
const port = process.env.PORT || 3000;
const AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36";
const app = express();
app.use(express.static("www"));
async function checkLink(req, res, next) {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  console.log("Accepted request from %s => %s", ip, req.route.path);
  const url = req.query.url;
  if (!url) return res.status(404).type("text").send("No YouTube link.");
  if (!ytcore.validateURL(url))
    return res.status(400).type("text").send("Video not found.");
  req.query.url = `https://youtube.com/watch?v=${ytcore.getVideoID(url)}`;
  try {
    await ytcore.getBasicInfo(req.query.url, {
      requestOptions: {
        userAgent: AGENT,
      },
    });
  } catch (error) {
    console.log("error: ", error);
    if (error.message.includes("410"))
      return res.type("text").status(411).send("Video is age resticted.");
    else if (error.message.includes("private"))
      return res.type("text").status(410).send("Video is private.");
    else return res.type("text").status(500).send(error.toString());
  }
  next();
}
app.get("/formats", checkLink, async (_req, res) => {
  const info = await ytcore.getBasicInfo(_req.query.url);
  info.formats.forEach((x) => {
    delete x.approxDurationMs;
    delete x.audioChannels;
    delete x.projectionType;
    delete x.averageBitrate;
    delete x.lastModified;
    x.onlyAudio = x.onlyVideo = false;
    if (x.audioQuality && !x.qualityLabel) x.onlyAudio = true;
    else if (!x.audioQuality && x.qualityLabel) x.onlyVideo = true;
    delete x.audioChannels;
    delete x.audioSampleRate;
    delete x.initRange;
    delete x.indexRange;
    delete x.signatureCipher;
    delete x.url;
    if (x.mimeType.includes("audio/mp4"))
      x.mimeType = x.mimeType.replace("audio/mp4", "audio/mp3");
    else if (x.mimeType.includes("audio/webm"))
      x.mimeType = x.mimeType.replace("audio/webm", "audio/weba");
  });
  res.json(info.formats);
});
app.get("/format", checkLink, async (_req, res) => {
  const itag = _req.query.itag;
  if (!itag || isNaN(itag) || itag < 0)
    return res.type("text").status(401).send("No parameters.");
  const info = await ytcore.getInfo(_req.query.url);
  const format = info.formats.filter((f) => f.itag == _req.query.itag)[0];
  if (format.contentLength)
    res.setHeader("Content-Length", format.contentLength);
  ytcore
    .downloadFromInfo(info, {
      filter: (format) => format.itag == _req.query.itag,
    })
    .pipe(res);
});
app.get("/info", checkLink, async (_req, res) => {
  const data = await ytcore.getBasicInfo(_req.query.url);
  const thumburl = data.videoDetails.thumbnails.filter(
    (x) =>
      x.width + x.height ==
      Math.max.apply(
        Math,
        data.videoDetails.thumbnails.map((x) => x.width + x.height)
      )
  )[0]?.url;
  const resdata = {
    id: data.videoDetails.videoId,
    title: data.videoDetails.title,
    description: data.videoDetails.description,
    ageRestricted: data.videoDetails.age_restricted,
    thumbnailURL: thumburl ?? "https://img.youtube.com/vi/null/mqdefault.jpg",
    author: {
      id: data.videoDetails.author.id,
      name: data.videoDetails.author.name,
      subCount: data.videoDetails.author.subscriber_count,
      isVerifed: data.videoDetails.author.verified,
    },
    uploadDate: data.videoDetails.uploadDate,
    length: data.videoDetails.lengthSeconds,
    unlisted: data.videoDetails.isUnlisted,
    views: data.videoDetails.viewCount,
  };

  res.json(resdata);
});
app.get("/", (_req, res) => res.send("¯\\_(ツ)_/¯"));
app.listen(port);
console.log("Server started on %d", port);
