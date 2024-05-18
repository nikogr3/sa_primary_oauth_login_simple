import express from "express";
import cors from "cors";
import dotenv from "dotenv";

const app = express();
const port = process.env.PORT || 3000;

//needed for CommonJS
import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.static(__dirname + "/src"));
dotenv.config();

app.enable("trust proxy");

app.use(
  cors({
    credentials: true,
    origin: ["https://desktop.wxcc-us1.cisco.com", "https://desktop.wxcc-eu1.cisco.com", "http://localhost:3000", "http://localhost:3006", "https://idbroker-b-us.webex.com", "https://sa-primary-oauth-login.onrender.com", "https://outbound-campaign-app.onrender.com"]
  })
);

app.use(express.json());

const AUTH_AUTHORIZE_URL = process.env.AUTH_AUTHORIZE_URL || `https://webexapis.com/v1/authorize`;
const AUTH_ACCESS_TOKEN_URL = process.env.AUTH_ACCESS_TOKEN_URL || `https://webexapis.com/v1/access_token`;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const REDIRECT_URI = process.env.REDIRECT_URI || "http://localhost:3000/auth";

const SCOPE = process.env.SCOPE || "cjp:config cjp:config_read cjp:config_write spark:people_read cjp:user";

function buildLoginUrl() {
  const baseUrlRedirectEncoded = encodeURI(AUTH_AUTHORIZE_URL);
  const clientIdEncoded = encodeURIComponent(CLIENT_ID);
  const redirectUriEncoded = encodeURIComponent(REDIRECT_URI);
  const scopeEncoded = encodeURIComponent(SCOPE);

  // optional: include something useful in state, like page to redirect to
  const stateEncoded = encodeURIComponent(state);

  return `${baseUrlRedirectEncoded}?client_id=${clientIdEncoded}&response_type=code&redirect_uri=${redirectUriEncoded}&scope=${scopeEncoded}&state=${stateEncoded}`;
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

    const token = await response.json();
    console.log(`TOKEN: ${token}`);

    // Translate `expires_in` duration to approximate timestamps ASAP
    const now = Date.now();
    token.expiresAt = now + token.expires_in * 1000; // usually a few hours
    token.refreshExpiresAt = now + token.refresh_token_expires_in * 1000; // usually a few days

    return token;
  } catch (error) {
    console.log(`Something went wrong, ${error}`);
  }
}

app.get("/auth", async (req, res) => {
  buildLoginUrl();
  res.redirect("/home");
});

app.get("/auth/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    res.status(400).send("Authorization code is missing");
    return;
  }

  const token = await exchangeCodeForToken(code);
  if (token) {
    res.redirect(`/auth-success?token=${token.access_token}&expiresAt=${token.expiresAt}`);
  } else {
    res.status(500).send("Failed to exchange code for token");
  }
});

app.get("/auth-success", (req, res) => {
  res.send(`<html>
              <head>
                <title>Authentication Successful</title>
              </head>
              <body>
                <script>
                  const urlParams = new URLSearchParams(window.location.search);
                  const token = urlParams.get('token');
                  const expiresAt = urlParams.get('expiresAt');
                  if (token && expiresAt) {
                    window.opener.postMessage({ token, expiresAt }, '*');
                    window.close();
                  } else {
                    document.body.innerHTML = 'Failed to retrieve token.';
                  }
                </script>
              </body>
            </html>`);
});

app.get("/", (req, res) => {
  res.send("server running");
});

app.use("/home", async (req, res, next) => {
  const { expiresAt, access_token } = await getSessionToken(req);
  const orgId = await access_token.split("_").slice("2").join("_");

  res.send(`<html>
                <head>
                  <title>Admin Access token scopes</title>
                  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300&family=Material+Symbols+Outlined:wght@100&family=Montserrat:wght@300;500&display=swap">
                </head>
                <body style="padding:4% 8%;display:flex;flex-direction: column;justify-content: center;align-items: center; font-family: 'Montserrat', sans-serif; font-weight: 300; gap:10px;">
                    <img style="margin-bottom: 10px" src="https://wxccdemo.s3.us-west-1.amazonaws.com/images/webex/webex-symbol.png"
                      alt="Cisco Webex">
                    <p style="margin:0">Your token will expire at: </p>
                    <div style="display:flex;flex-direction: column;justify-content: center;align-items: center;">
                      <p>
                        <strong style="color:#007AA3"> <strong style="margin-right: 5px;color:#000;font-weight: 300">UTC:  </strong> ${new Date(expiresAt).toLocaleString("en-US", { timeZone: "UTC" })} </strong> <br> <strong style="color:#007AA3">
                          <strong style="margin-right: 5px; color:#000;font-weight: 300">PST: </strong>${new Date(expiresAt).toLocaleString("en-US", {
                            timeZone: "America/Los_Angeles"
                          })} </strong>
                      </p>
                      <hr style="width: 100%; margin:0; border: 1px solid lightgray">
                      <div style=" display:flex;flex-direction: column;justify-content: center;align-items: center;">
                        <p style="text-align: center;">Your orgId:<br>
                        <strong style="color:#007AA3;font-weight: 500;">${orgId}</strong></p> 
                      </div>
                      
                      <hr style="width: 100%; margin:0; border: 1px solid lightgray">
                    </div>

                    <p>You can now close this tab...</p>

                    <div style=" display: flex; justify-content: center; align-items: center;flex-direction: column;">
                      <p style=" color:#C8C8C8; font-size: 0.8rem; text-align: center;">** If you need to refresh, click below and then refresh
                        Desktop browser for
                        new token</p>
                      <a style="text-decoration: none; font-size: 0.9rem; display: inline-flex; align-items: center; cursor: pointer;"
                        href="https://sa-primary-oauth-login.onrender.com/logout">
                        <span class="material-symbols-outlined" style="vertical-align: middle; cursor: pointer;">logout</span> Force Token Refresh
                      </a>
                    </div>
                  </body>
             </html>
    `);
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Running on port ${port}`);
});
