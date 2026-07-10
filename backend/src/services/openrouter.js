const OpenAI = require('openai');
const { writeFileInContainer } = require('./docker');

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

async function runClaudeCode(containerId, prompt, onChunk) {
  const stream = await client.chat.completions.create({
    model: 'openai/gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are an expert developer assistant.
When creating files, use this EXACT format for every file:

===FILE: filename.ext===
<complete file contents here>
===END===

RULES:
- Always write complete, working file contents
- Multiple files: repeat the block back to back
- After ALL file blocks, write a SHORT plain-text summary (2-3 sentences max)
- No markdown in the summary, no bullet points, no headers
- The summary is the ONLY thing the user sees in chat`
      },
      { role: 'user', content: prompt }
    ],
    stream: true,
  });

  let buffer = '';
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || '';
    if (text) buffer += text;
    // Don't stream raw content to frontend — we'll send clean summary at end
  }

  // Parse and write files to container
  const fileRegex = /===FILE:\s*(.+?)===\n([\s\S]*?)===END===/g;
  let match;
  let count = 0;
  const fileNames = [];

  while ((match = fileRegex.exec(buffer)) !== null) {
    const filename = match[1].trim();
    const content  = match[2];
    try {
      await writeFileInContainer(containerId, filename, content);
      count++;
      fileNames.push(filename);
      onChunk('stdout', `✓ Created: ${filename}\n`);
    } catch (err) {
      onChunk('stderr', `✗ Failed: ${filename}: ${err.message}\n`);
    }
  }

  // Extract only the plain-text summary (everything after last ===END===)
  const lastEnd = buffer.lastIndexOf('===END===');
  let summary = lastEnd >= 0
    ? buffer.slice(lastEnd + 9).trim()
    : buffer.trim();

  // Fallback summary if model gave nothing after ===END===
  if (!summary || summary.length < 10) {
    summary = count > 0
      ? `Built ${count} file${count > 1 ? 's' : ''}: ${fileNames.join(', ')}.`
      : 'No files were generated. Try rephrasing your request.';
  }

  // Stream the clean summary to the frontend char by char
  for (const char of summary) {
    onChunk('stdout', char);
    await new Promise(r => setTimeout(r, 8)); // slight delay for streaming feel
  }

  return buffer;
}

module.exports = { runClaudeCode };
