import SteamSession from "steam-session";
import SteamTotp from "steam-totp";
import ReadLine from "readline";
import dotenv from "dotenv";
import fs from 'fs';

dotenv.config();

import startJobCheckCart from "./crons/cart-cheker.js";

let g_AbortPromptFunc = null;

export default async function initSteamSession() {
  let accountName = process.env.STEAM_ACCOUNT;
  let password = process.env.STEAM_PASSWORD;

  // Create a new Steam session
  let session = new SteamSession.LoginSession(SteamSession.EAuthTokenPlatformType.SteamClient);

  try {
    // Check if there is a saved session
    const savedData = JSON.parse(fs.readFileSync('steam_session.json', 'utf8'));
    if (savedData.refreshToken) {
      session.refreshToken = savedData.refreshToken;
      await session.refreshAccessToken(savedData.refreshToken);
      console.log('Session successfully restored');

      startJobCheckCart(session);
      return;
    }
  } catch (err) {
    console.log('A new authorization is required');
  }

  session.on("authenticated", async () => {
    abortPrompt();

    // Save the refreshToken
    const refreshToken = session.refreshToken;
    fs.writeFileSync('steam_session.json', JSON.stringify({ refreshToken }));
    console.log('Session token saved');

    startJobCheckCart(session);
  });

  let startResult = await session.startWithCredentials({ accountName, password });

  if (startResult.actionRequired) {
    let codeActionTypes = [SteamSession.EAuthSessionGuardType.EmailCode, SteamSession.EAuthSessionGuardType.DeviceCode];
    let codeAction = startResult.validActions.find((action) => codeActionTypes.includes(action.type));

    if (codeAction) {
      if (codeAction.type == SteamSession.EAuthSessionGuardType.EmailCode) {
        // We wouldn't expect this to happen since mobile confirmations are only possible with 2FA enabled, but just in case...
        console.log(`A code has been sent to your email address at ${codeAction.detail}.`);
      } else {
        console.log("You need to provide a Steam Guard Mobile Authenticator code.");
      }

      let code = await promptAsync("Code or Shared Secret: ");
      if (code) {
        // The code might've been a shared secret
        if (code.length > 10) {
          code = SteamTotp.getAuthCode(code);
        }
        await session.submitSteamGuardCode(code);
      }

      // If we fall through here without submitting a Steam Guard code, that means one of two things:
      //   1. The user pressed enter without providing a code, in which case the script will simply exit
      //   2. The user approved a device/email confirmation, in which case 'authenticated' was emitted and the prompt was canceled
    }
  }
}

// Nothing interesting below here, just code for prompting for input from the console.

function promptAsync(question, sensitiveInput = false) {
  return new Promise((resolve) => {
    let rl = ReadLine.createInterface({
      input: process.stdin,
      output: sensitiveInput ? null : process.stdout,
      terminal: true,
    });

    g_AbortPromptFunc = () => {
      rl.close();
      resolve("");
    };

    if (sensitiveInput) {
      // We have to write the question manually if we didn't give readline an output stream
      process.stdout.write(question);
    }

    rl.question(question, (result) => {
      if (sensitiveInput) {
        // We have to manually print a newline
        process.stdout.write("\n");
      }

      g_AbortPromptFunc = null;
      rl.close();
      resolve(result);
    });
  });
}

function abortPrompt() {
  if (!g_AbortPromptFunc) {
    return;
  }

  g_AbortPromptFunc();
  process.stdout.write("\n");
}
