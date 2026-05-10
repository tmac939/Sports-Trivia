# Ball Knowledge ‚Äî Multiplayer Sports Trivia

A real-time multiplayer sports trivia app powered by Claude AI.

## Files

```
sports-trivia/
‚îú‚îÄ‚îÄ public/
‚îÇ   ‚îî‚îÄ‚îÄ index.html       ‚Üê The entire frontend app
‚îú‚îÄ‚îÄ api/
‚îÇ   ‚îî‚îÄ‚îÄ generate.js      ‚Üê Serverless function (generates questions via Claude)
‚îú‚îÄ‚îÄ vercel.json          ‚Üê Vercel deployment config
‚îú‚îÄ‚îÄ package.json         ‚Üê Node config
‚îî‚îÄ‚îÄ README.md
```

## Deploy to Vercel

1. Push all these files to your GitHub repo
2. Go to vercel.com ‚Üí New Project ‚Üí Import your repo
3. Add environment variable: `ANTHROPIC_API_KEY` = your key
4. Click Deploy

## Environment Variables (set in Vercel dashboard)

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

