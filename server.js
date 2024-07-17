import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, AUTH_AUTHORIZE_URL, AUTH_ACCESS_TOKEN_URL, SCOPE, JWT_SECRET } = process.env;

app.use(express.json());
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = ["https://desktop.wxcc-us1.cisco.com", "https://desktop.wxcc-eu1.cisco.com", "https://desktop.wxcc-anz1.cisco.com", "https://desktop.wxcc-sg1.cisco.com", "http://localhost:3000", "http://localhost:3006", "https://idbroker-b-us.webex.com", "https://sa-primary-oauth-login.onrender.com", "https://outbound-campaign-app.onrender.com"];
      if (allowedOrigins.includes(origin) || !origin) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true
  })
);

// Function to build the login URL
function buildLoginUrl(frontendUrl) {
  const clientIdEncoded = encodeURIComponent(CLIENT_ID);
  const redirectUriEncoded = encodeURIComponent(REDIRECT_URI);
  const scopeEncoded = encodeURIComponent(SCOPE);
  const stateEncoded = encodeURIComponent(frontendUrl);

  return `${AUTH_AUTHORIZE_URL}?client_id=${clientIdEncoded}&response_type=code&redirect_uri=${redirectUriEncoded}&scope=${scopeEncoded}&state=${stateEncoded}`;
}

async function exchangeCodeForToken(code) {
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      redirect_uri: REDIRECT_URI
    });

    const response = await fetch(AUTH_ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });

    if (!response.ok) {
      throw new Error(`Error fetching token: ${response.statusText}`);
    }

    const token = await response.json();

    const now = Date.now();
    token.expiresAt = now + token.expires_in * 1000;

    return token;
  } catch (error) {
    console.error(`Something went wrong, ${error}`);
    throw error;
  }
}
// Endpoint to verify the buildLoginUrl function
app.get("/initiate-oauth", (req, res) => {
  try {
    const frontendUrl = req.query.frontendUrl;
    const loginUrl = buildLoginUrl(frontendUrl);
    res.redirect(loginUrl);
  } catch (error) {
    console.error("Error generating login URL:", error);
    res.status(500).send("Error generating login URL");
  }
});

app.get("/auth", async (req, res) => {
  const { code, state } = req.query;

  try {
    const token = await exchangeCodeForToken(code);
    const jwtToken = jwt.sign({ ...token, accessToken: token.access_token }, JWT_SECRET);
    const frontendRedirectUrl = `${state}?jwtToken=${jwtToken}`;
    // const frontendRedirectUrl = state;

    res.redirect(frontendRedirectUrl);
  } catch (error) {
    console.error("Error exchanging code for token:", error);
    res.status(500).send("Error exchanging code for token");
  }
});

app.get("/token", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(" ")[1];
      jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
          return res.sendStatus(403);
        }
        res.json({ jwtToken: token });
      });
    } else {
      res.status(401).send("Unauthorized");
    }
  } catch (error) {
    console.error("Error verifying JWT:", error);
    res.status(500).send("Error verifying JWT");
  }
});

app.get("/test", (req, res) => {
  res.send("up and running");
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
