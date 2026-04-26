// Single-agent v1: Nikki's email is the agent allowlist.
// Mirror this in supabase/migrations/0001_init.sql is_agent() function
// if it ever changes.
export const AGENT_EMAIL = "nikki@kw.com";

export function isAgentEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.trim().toLowerCase() === AGENT_EMAIL);
}
