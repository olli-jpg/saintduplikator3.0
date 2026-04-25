import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { imageBase64, imageType } = req.body
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
    if (!imageBase64) return res.status(400).json({ error: 'No screenshot provided' })

    let screenshotBase64, screenshotMediaType
    const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      screenshotMediaType = match[1]
      screenshotBase64 = match[2]
    } else {
      screenshotBase64 = imageBase64
      screenshotMediaType = imageType || 'image/png'
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(screenshotMediaType)) screenshotMediaType = 'image/png'

    const proto = req.headers['x-forwarded-proto'] || 'https'
    const host = req.headers.host
    const logoUrl = `${proto}://${host}/logo.png`

    const brandContext = `SAINT MODEL MANAGEMENT — OFFICIAL BRAND GUIDELINES

COLOURS
- Primary background: #0D0118 (Deep Purple)
- Alternating sections / card backgrounds: #120220 (Dark Purple), #1A0330 (Purple Deep)
- Primary accent: #FF2BAA (Candy Pink)
- Secondary accent: #6B0FA0 (Royal Purple)
- Brand gradient: #FF2BAA → #6B0FA0 — use for CTAs, accent bars, rings, highlights
- Hover / soft accents: #FF6CC8 (Pink Light)
- Secondary text: #A090BB (Muted Lavender)
- Primary text on dark: #F5F0FF (Off-White)

TYPOGRAPHY
- Display font: Playfair Display — weights 700 (Bold) or 900 (Black), italic available
  · Hero Title: 56–76px, weight 900
  · Section Title: 32–52px, weight 900
  · Pull-quotes: Playfair Display, bold/italic
  · NEVER use Playfair Display for body copy or UI elements
- Body font: Inter — weights 300–900
  · Card Heading: 20–22px, Inter 800
  · Body copy: 15–17px, Inter 400
  · Labels / eyebrows: 10–12px, Inter 700, UPPERCASE, letter-spacing 2px

VISUAL STYLE
- Dark-first design — brand is built for the night: exclusive, premium, creator-first
- Use the brand gradient (#FF2BAA → #6B0FA0) for accents, borders, highlights, CTAs
- Luxury and boldness together — never sterile, never cheap
- Deep contrast: dark backgrounds make pink/purple pop

BRAND VOICE
- Bold & Confident: direct, assertive, short sentences, strong verbs
- Empowering: creator-first always, the creator is the hero
- Transparent: no fluff, no empty enthusiasm, no corporate hedging
- Luxurious but Real: premium and aspirational, never cold or untouchable
- No over-promising. Just confidence backed by results.`

    const systemPrompt = `You are a brand designer for Saint Model Management, a luxury talent agency.
Your job is to take any Instagram post screenshot and recreate it with our brand applied — same content, same layout structure, but in our visual identity.
You output only valid JSON, no markdown, no code fences.`

    const userPrompt = `Analyze this Instagram post and recreate it with Saint's brand applied.

Step 1 — Extract EVERY piece of text from the original post verbatim: headlines, subheadlines, body text, captions, hashtags, usernames, CTAs, numbers, anything visible. CRITICAL: never truncate, shorten, or split names — preserve full names exactly as shown.

Step 2 — Generate a complete self-contained HTML document (1080×1080px) that recreates the post's layout and content but in Saint's brand style:
- Background: dark (#0D0118 or black gradient)
- Accent colors: hot pink (#FF2BAA) and purple (#6B0FA0)
- Fonts via Google Fonts CDN: Playfair Display (headings/titles only, weight 700 or 900), Inter (ALL body copy, labels, descriptions — weight 400 regular, never italic)
- STRICT RULE: body copy and description text MUST use Inter font-family, font-weight:400, font-style:normal — never use Playfair Display or italic for body text
- STRICT RULE: all text must fit inside the 1080×1080px canvas — adjust font sizes if needed, never let text overflow or get clipped
- STRICT RULE: if the layout includes an image placeholder area, NO text or elements may overlap or sit on top of it — all text must be positioned outside the placeholder zone so a real photo can be dropped in cleanly later
- Keep the same layout type as the original (quote card, stat card, lifestyle, product, etc.)
- All original text must appear in the HTML — EXCEPT: do NOT include any @usernames, @handles, social media tags, watermarks, or account names from the original post
- Make it look polished, high-end, Instagram-ready

Step 3 — Write a new Instagram caption in Saint's voice using the same core message.

Brand guidelines to apply:
${brandContext}

SAINT BRANDING: In the bottom-right corner of the post, place this exact branding block with position:absolute, bottom:24px, right:24px, text-align:right:
<img src="${logoUrl}" alt="Saint" style="height:36px;display:block;margin-left:auto;mix-blend-mode:screen;" />
<div style="font-family:'Inter',sans-serif;font-size:11px;color:#A090BB;letter-spacing:1px;margin-top:4px;">@saintmodelmgmt</div>

Return exactly this JSON (no other text):
{
  "extractedText": "all text from original post, exactly as it appears",
  "contentTheme": "core theme in 4-6 words",
  "brandedCaption": "full Instagram caption with emojis and 8-12 hashtags",
  "html": "COMPLETE self-contained HTML document — must include <!DOCTYPE html>, Google Fonts link tags, all inline or embedded CSS, and all content. No external files except Google Fonts CDN and the logo src above."
}`

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })
    const claudeResponse = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: screenshotMediaType, data: screenshotBase64 } },
          { type: 'text', text: userPrompt }
        ]
      }]
    })

    const textBlock = claudeResponse.content.find(b => b.type === 'text')
    if (!textBlock) throw new Error('No text response from Claude')

    let analysis
    try {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
      analysis = JSON.parse(jsonMatch ? jsonMatch[0] : textBlock.text)
    } catch {
      throw new Error('Failed to parse Claude response. Please try again.')
    }

    res.json({ success: true, analysis })
  } catch (error) {
    console.error('Error:', error.message)
    res.status(500).json({ error: error.message })
  }
}
