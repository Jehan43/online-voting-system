// Sends the OTP email.
//   EMAIL_MODE=console -> prints the code in the terminal (local development only)
//   EMAIL_MODE=ses     -> sends a real email with Amazon SES
const config = require("./config");
const { HttpError } = require("./httpError");

let sesClient = null;

async function sendOtpEmail(to, code, purpose) {
  const subject =
    purpose === "signup"
      ? "Verify your email - Online Voting System"
      : "Your login code - Online Voting System";
  const text =
    "Your one-time code is: " + code + "\n\n" +
    "It is valid for 5 minutes and can be used once.\n" +
    "If you did not request this code, you can ignore this email.";

  if (config.emailMode === "console") {
    console.log("[DEV EMAIL] To: " + to + " | " + subject + " | OTP: " + code);
    return;
  }

  if (config.emailMode === "brevo") {
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": config.brevoApiKey, "content-type": "application/json" },
        body: JSON.stringify({
          sender: { email: config.sesFromEmail },
          to: [{ email: to }],
          subject: subject,
          textContent: text,
        }),
      });
      if (!res.ok) throw new Error("Brevo returned " + res.status);
    } catch (err) {
      console.error("Brevo error:", err.message);
      throw new HttpError(502, "We could not send the email. Please try again in a moment.");
    }
    return;
  }

  try {
    const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
    if (!sesClient) {
      sesClient = new SESClient({ region: config.awsRegion });
    }
    await sesClient.send(
      new SendEmailCommand({
        Source: config.sesFromEmail,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: { Text: { Data: text } },
        },
      })
    );
  } catch (err) {
    // In the Learner Lab, SES is in sandbox mode: the recipient must be a verified address.
    console.error("SES error:", err.message);
    throw new HttpError(502, "We could not send the email. Please try again in a moment.");
  }
}

module.exports = { sendOtpEmail };