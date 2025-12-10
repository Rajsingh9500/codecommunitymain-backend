import { Resend } from "resend";
import dotenv from "dotenv";
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (to, subject, html) => {
  if (!process.env.RESEND_API_KEY) {
    console.error("❌ RESEND_API_KEY missing in .env");
    return;
  }

  try {
    const response = await resend.emails.send({
      from: `CodeCommunity <${process.env.RESEND_SENDER_EMAIL}>`,
      to,
      subject,
      html,
    });

    if (response.error) {
      console.error("❌ Resend error:", response.error);
      throw new Error(response.error.message);
    }

    console.log("📩 Email sent to:", to);
    return response;
  } catch (err) {
    console.error("❌ sendEmail error:", err);
    throw err;
  }
};
