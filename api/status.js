export default function handler(req, res) {
  res.json({ anthropic: !!process.env.ANTHROPIC_API_KEY })
}
