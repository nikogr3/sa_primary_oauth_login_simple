import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

const app = express();
const port = process.env.PORT || 3000;

//needed for CommonJS
import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.static(__dirname + "/src"));
dotenv.config();

app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = ["https://desktop.wxcc-us1.cisco.com", "https://desktop.wxcc-eu1.cisco.com", "http://localhost:3000", "http://localhost:3006", "https://idbroker-b-us.webex.com", "https://sa-primary-oauth-login.onrender.com", "https://outbound-campaign-app.onrender.com"];
      if (allowedOrigins.includes(origin) || !origin) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true
  })
);

app.use(express.json());

const tokenStorage = {};

const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, AUTH_AUTHORIZE_URL, AUTH_ACCESS_TOKEN_URL, SCOPE } = process.env;

function buildLoginUrl() {
  const baseUrlRedirectEncoded = encodeURI(AUTH_AUTHORIZE_URL);
  const clientIdEncoded = encodeURIComponent(CLIENT_ID);
  const redirectUriEncoded = encodeURIComponent(REDIRECT_URI);
  const scopeEncoded = encodeURIComponent(SCOPE);

  return `${baseUrlRedirectEncoded}?client_id=${clientIdEncoded}&response_type=code&redirect_uri=${redirectUriEncoded}&scope=${scopeEncoded}&state="set_state"`;
}

async function exchangeCodeForToken(code) {
  try {
    const body = {
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      redirect_uri: REDIRECT_URI
    };

    const response = await fetch(AUTH_ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Error fetching token: ${response.statusText}`);
    }

    const token = await response.json();

    const now = Date.now();
    token.expiresAt = now + token.expires_in * 1000;

    return token;
  } catch (error) {
    console.log(`Something went wrong, ${error}`);
  }
}

function getToken(tokenId) {
  const token = tokenStorage[tokenId];
  if (token && token.expiresAt < Date.now()) {
    delete tokenStorage[tokenId];
    return null;
  }
  return token;
}

function requireAuthentication(req, res, next) {
  const tokenId = req.query.tokenId;
  const token = getToken(tokenId);
  if (!token) {
    res.redirect(`/auth?tokenId=${tokenId}`);
    return;
  }
  req.token = token;
  next();
}

app.get("/test", (req, res) => {
  res.send("server running");
});

app.get("/auth", async (req, res) => {
  const tokenId = req.query.tokenId;
  console.log(`Initial Token ID: ${tokenId}`);
  const sessionToken = tokenId ? tokenStorage[tokenId] : null;

  if (!sessionToken && !req.query.code) {
    const state = encodeURIComponent(JSON.stringify({ tokenId: tokenId || "" }));
    res.redirect(buildLoginUrl(state));
    return;
  }

  if (!sessionToken) {
    try {
      const token = await exchangeCodeForToken(req.query.code);
      const newTokenId = token.access_token;
      tokenStorage[newTokenId] = token;
      console.log(`Token stored with tokenId: ${newTokenId}`);
      res.redirect(`/home?tokenId=${newTokenId}`);
    } catch (e) {
      console.error(`Error during token exchange: ${e}`);
      res.status(503).send("Unable to contact authentication server, please try again later.");
    }
    return;
  }

  res.redirect("/home");
});

app.get("/token", requireAuthentication, (req, res) => {
  const { access_token, expiresAt } = req.token;
  console.log(`client trying to get toek: ${access_token}`);
  res.json({ access_token, expiresAt });
});

app.get("/home", requireAuthentication, (req, res) => {
  const { expiresAt, access_token } = req.token;
  res.send(`Access Token: ${access_token}<br>Expires At: ${new Date(expiresAt).toLocaleString()}`);
});

// app.use("/home", requireAuthentication, (req, res) => {
//   const { expiresAt, access_token } = req.token;
//   const orgId = access_token.split("_").slice("2").join("_");
//   res.send(`
//   <html>
//   <head>
//     <title>Admin Access token scopes</title>
//     <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300&family=Material+Symbols+Outlined:wght@100&family=Montserrat:wght@300;500&display=swap">
//   </head>
//   <body style="padding:4% 8%;display:flex;flex-direction: column;justify-content: center;align-items: center; font-family: 'Montserrat', sans-serif; font-weight: 300; gap:10px;">
//   <img style="margin-bottom: 10px" src="https://wxccdemo.s3.us-west-1.amazonaws.com/images/webex/webex-symbol.png" alt="Cisco Webex">
//   <div style="display:flex;flex-direction: column;justify-content: center;align-items: center;">
//   <p>
//   <strong style="color:#007AA3"> <strong style="margin-right: 5px;color:#000;font-weight: 300">UTC:  </strong> ${new Date(expiresAt).toLocaleString("en-US", { timeZone: "UTC" })} </strong> <br> <strong style="color:#007AA3">
//   <strong style="margin-right: 5px; color:#000;font-weight: 300">PST: </strong>${new Date(expiresAt).toLocaleString("en-US", {
//     timeZone: "America/Los_Angeles"
//   })} </strong>
//   </p>
//   <hr style="width: 100%; margin:0; border: 1px solid lightgray">
//   <div style=" display:flex;flex-direction: column;justify-content: center;align-items: center;">
//   <p style="text-align: center;">Your orgId:<br>
//   <strong style="color:#007AA3;font-weight: 500;">${orgId}</strong></p>
//   </div>
//   <hr style="width: 100%; margin:0; border: 1px solid lightgray">
//   </div>
//   <p>You can now close this tab...</p>
//   <div style=" display: flex; justify-content: center; align-items: center;flex-direction: column;">
//    <p style=" color:#C8C8C8; font-size: 0.8rem; text-align: center;">** If you need to refresh, click below and then refresh Desktop browser for new token</p>
//   <a style="text-decoration: none; font-size: 0.9rem; display: inline-flex; align-items: center; cursor: pointer;"href="https://sa-primary-oauth-login.onrender.com/logout">
//   <span class="material-symbols-outlined" style="vertical-align: middle; cursor: pointer;">logout</span> Force Token Refresh</a>
//   </div>
//   </body>
//   </html>
//   `);
// });

app.listen(process.env.PORT || 3000, () => {
  console.log(`Running on port ${port}`);
});
