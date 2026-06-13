import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const userId = url.searchParams.get("userId");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

  // The redirect URI needs to match this function's URL (without query params)
  const redirectUri = `${url.origin}${url.pathname}`;

  if (action === "login" && userId) {
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.compose email");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", userId);

    return new Response(JSON.stringify({ url: authUrl.toString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }

  if (code && state) {
    try {
      // Exchange code for tokens
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(`Failed to exchange token: ${await tokenResponse.text()}`);
      }

      const tokens = await tokenResponse.json();
      const { access_token, refresh_token, expires_in } = tokens;

      // Fetch user email
      const userinfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      if (!userinfoResponse.ok) {
        throw new Error(`Failed to fetch user info: ${await userinfoResponse.text()}`);
      }

      const userinfo = await userinfoResponse.json();
      const email = userinfo.email;

      // Upsert into Supabase
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const tokenExpiry = new Date();
      tokenExpiry.setSeconds(tokenExpiry.getSeconds() + expires_in);

      const { error } = await supabase
        .from("email_accounts")
        .upsert(
          {
            user_id: state, // state contains the user_id
            email,
            provider: "gmail",
            access_token,
            refresh_token,
            token_expiry: tokenExpiry.toISOString(),
            is_active: true,
          },
          { onConflict: "user_id,email" }
        );

      if (error) {
        console.error("Supabase upsert error:", error);
        throw error;
      }

      return Response.redirect("https://frictionpulse.vercel.app/dashboard?sync=success", 302);
    } catch (error) {
      console.error("OAuth callback error:", error);
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }
  }

  return new Response("Invalid request", {
    headers: corsHeaders,
    status: 400,
  });
});
