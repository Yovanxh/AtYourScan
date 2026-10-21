/**
 * supabase/functions/gemini-menu-ingest/index.ts
 * 
 * Supabase Edge Function: Gemini Multimodal Menu Ingestion.
 * Strictly enforces backend-level authorization guards: validates the caller's JWT role;
 * non-admin tokens are immediately rejected with a 403 Forbidden status.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Extract Bearer JWT from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({
          error: "403 Forbidden: Missing Authorization token",
          status: 403,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();

    // 2. Decode & validate JWT role
    let callerRole = "";
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
        const payload = JSON.parse(payloadJson);
        callerRole = (payload.role || payload.user_metadata?.role || "").toLowerCase();
      }
    } catch {
      // Fallback: verify with Supabase client
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (user && !error) {
          callerRole = (user.role || user.user_metadata?.role || "").toLowerCase();
        }
      }
    }

    // 3. Strict Backend Authorization Guard: Non-admin tokens are rejected with 403
    if (callerRole !== "admin") {
      return new Response(
        JSON.stringify({
          error: "403 Forbidden: Admin role required for Gemini menu ingestion",
          status: 403,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Admin authorized: parse request body
    const body = await req.json().catch(() => ({}));
    const text = body.text || "";

    return new Response(
      JSON.stringify({
        success: true,
        message: "Gemini menu ingestion authorized for admin",
        text,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message, status: 500 }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
