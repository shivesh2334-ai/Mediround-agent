export const authed = (req: Request) => !!process.env.AGENT_API_KEY && req.headers.get("x-agent-key") === process.env.AGENT_API_KEY;
