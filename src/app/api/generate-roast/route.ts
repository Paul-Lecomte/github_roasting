import { NextRequest, NextResponse } from "next/server";

// --- Début Rate Limiter ---
const rateLimitMap = new Map<string, { count: number, last: number }>();
const RATE_LIMIT = 25; // max requêtes
const WINDOW = 60 * 1000; // 1 minute

function isRateLimited(ip: string) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, last: now };
    if (now - entry.last > WINDOW) {
        rateLimitMap.set(ip, { count: 1, last: now });
        return false;
    }
    if (entry.count >= RATE_LIMIT) return true;
    rateLimitMap.set(ip, { count: entry.count + 1, last: entry.last });
    return false;
}
// --- Fin Rate Limiter ---

export async function POST(req: NextRequest) {
    // Récupération IP (fallback "unknown")
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(ip)) {
        return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { profile, roastType } = await req.json();

    const promptAddendum = `
Ensure **every field** is filled with original, creative, and meaningful content.
Avoid placeholders, empty responses, or repeated filler like just "**".
Use natural, casual language with humor fitting the roast style.
Each item should be concise yet expressive.
Format your output exactly as a list with clear field names followed by a colon and the value.
For the Roast Description, write exactly 3 witty lines.
`;

    const lightRoastPrompt = `
Create a light-hearted, playful parody trading card for this GitHub user.
Keep the tone friendly and cheeky, like teasing a buddy who’s harmlessly obsessed with dark mode or quirky habits.

GitHub Profile:
${JSON.stringify(profile, null, 2)}

Provide these parody card fields with clear, fun, and original content:
- Name: A clever or ironic nickname
- Title: A humorous and positive dev role (e.g., "Bug Whisperer")
- Ability: A charming or amusing coding skill or trait (max 2 lines)
- Attack: A gentle roast move — playful, not harsh (max 2 lines)
- Resistance: One word representing what they handle effortlessly
- Weakness: One word revealing a funny vulnerability
- Special Move: A creative, amusing power move or signature trick
- Roast Description: Exactly 3 witty, kind, and lighthearted lines teasing them

${promptAddendum}
`;

    const mildRoastPrompt = `
Create a mildly snarky parody trading card for this GitHub user.
Keep the tone playful but a bit sharper — like teasing a teammate who insists "it works on my machine."

GitHub Profile:
${JSON.stringify(profile, null, 2)}

Provide these parody card fields with clever, original content:
- Name: A cheeky or ironic dev nickname
- Title: A humorous developer title (e.g., "Merge Conflict Master")
- Ability: An exaggerated or quirky skill or habit (max 2 lines)
- Attack: A witty roast move (max 2 lines)
- Resistance: One word describing what they seem immune to
- Weakness: One word pointing out their Achilles’ heel
- Special Move: A quirky or exaggerated superpower
- Roast Description: Exactly 3 lines of clever, fun roast — teasing but not cruel

${promptAddendum}
`;

    const spicyRoastPrompt = `
Create a brutally funny parody trading card for this GitHub user.
Go all out with savage, clever, and hilarious roasts — like a ruthless code review.

GitHub Profile:
${JSON.stringify(profile, null, 2)}

Provide these parody card fields with bold, original humor:
- Name: A savage or brutally funny dev nickname
- Title: A cutting developer title (e.g., "Senior Stack Overflow Copy-Paster")
- Ability: An embarrassing or ridiculous dev trait (max 2 lines)
- Attack: A devastating roast attack move (max 2 lines)
- Resistance: One word describing something they bizarrely survive
- Weakness: One word describing their ultimate weakness
- Special Move: An over-the-top, meme-worthy ultimate ability
- Roast Description: Exactly 3 sharp, absurd, and meme-worthy lines of roast

${promptAddendum}
`;

    let prompt = mildRoastPrompt;
    if (roastType === "light") prompt = lightRoastPrompt;
    if (roastType === "spicy") prompt = spicyRoastPrompt;

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        return NextResponse.json({ error: "API key missing" }, { status: 500 });
    }

    let data;
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: prompt,
                                },
                            ],
                        },
                    ],
                }),
            }
        );
        if (!response.ok) {
            return NextResponse.json({ error: "Gemini API error" }, { status: response.status });
        }
        data = await response.json();
    } catch (e) {
        return NextResponse.json({ error: "Request failed" }, { status: 500 });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    function cleanField(field: string | undefined): string {
        if (!field) return "no data";
        // Remove stars and trim whitespace
        const cleaned = field.replace(/\*+/g, "").trim();
        // Fallback to something meaningful if empty
        return cleaned.length > 0 ? cleaned : "no data";
    }

    const roastCard = {
        name: cleanField(text.match(/Name:\s*(.*)/)?.[1]),
        title: cleanField(text.match(/Title:\s*(.*)/)?.[1]),
        ability: cleanField(text.match(/Ability:\s*(.*)/)?.[1]),
        attack: cleanField(text.match(/Attack:\s*(.*)/)?.[1]),
        resistance: cleanField(text.match(/Resistance:\s*(.*)/)?.[1]),
        weakness: cleanField(text.match(/Weakness:\s*(.*)/)?.[1]),
        specialMove: cleanField(text.match(/Special Move:\s*(.*)/)?.[1]),
        description: cleanField(text.match(/Desc(?:ription)?:\s*([\s\S]*)/)?.[1]),
    };

    return NextResponse.json(roastCard);
}