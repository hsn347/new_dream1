const fs = require('fs');

let content = fs.readFileSync('src/lib/agentBrain.ts', 'utf8');

// Fix 1: Agent paused in imageMsg
content = content.replace(
  /if \(imageMsg && settings\?\.agentEnabled\) \{/,
  `if (imageMsg && settings?.agentEnabled) {\n        if (conversation.agentPaused) {\n          const displayText = mediaCaption.trim() || "[صورة]";\n          await db.insert(messagesTable).values({ conversationId: conversation.id, from: "customer", text: displayText });\n          await db.update(conversationsTable).set({ lastMessage: displayText, updatedAt: new Date() }).where(eq(conversationsTable.id, conversation.id));\n          return;\n        }`
);

// Fix 2: Duplicate DB queries in Omqi verification
content = content.replace(
  /const allSettings = await db\.select\(\)\.from\(systemSettingsTable\);\n\s+const settingsMap = Object\.fromEntries\(\n\s+allSettings\.map\(\(s\) => \[s\.key, s\.value\]\),\n\s+\);/g,
  `const agentSettings = await getGlobalAgentSettings();\n              const settingsMap = Object.entries(agentSettings).reduce((acc, [k, v]) => ({...acc, [k]: String(v)}), {});`
);

fs.writeFileSync('src/lib/agentBrain.ts', content);
