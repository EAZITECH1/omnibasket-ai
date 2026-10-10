'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';

export default function FormattedMessageContent({ content, isUser }) {
  if (!content) return null;

  const lines = content.split('\n');

  return (
    <div className="space-y-1.5 leading-relaxed text-xs break-words overflow-hidden" style={{ overflowWrap: 'anywhere' }}>
      {lines.map((line, lIdx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={lIdx} className="h-1" />;
        }

        // Handle ## or ### Headings
        if (trimmed.startsWith('### ')) {
          return (
            <div key={lIdx} className={`text-[11px] font-black uppercase tracking-wider mt-2 mb-1 ${isUser ? 'text-background' : 'text-bnb-yellow'}`}>
              {trimmed.replace(/^###\s+/, '')}
            </div>
          );
        }
        if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
          return (
            <div key={lIdx} className={`text-xs font-black uppercase tracking-wide border-b pb-1 mt-2 mb-1.5 ${isUser ? 'text-background border-background/30' : 'text-foreground border-muted'}`}>
              {trimmed.replace(/^#+\s+/, '')}
            </div>
          );
        }

        // Handle Bullet Points (*, -, •)
        const isBullet = trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ');
        const textToParse = isBullet ? trimmed.replace(/^[•\-\*]\s+/, '') : trimmed;

        // Parse inline markdown: [label](url), `code`, **bold**, *italic*
        const parseInline = (str) => {
          const parts = [];
          // Matches: [label](url) OR `code` OR **bold** OR *italic*
          const regex = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
          let lastIdx = 0;
          let match;

          while ((match = regex.exec(str)) !== null) {
            if (match.index > lastIdx) {
              parts.push(str.substring(lastIdx, match.index));
            }
            const token = match[0];

            // 1. Markdown Link: [label](url)
            if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
              const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
              if (linkMatch) {
                const rawLabel = linkMatch[1];
                const url = linkMatch[2];
                // Truncate long 0x hash labels to avoid spilling out of box
                const displayLabel = (rawLabel.startsWith('0x') && rawLabel.length > 18)
                  ? `${rawLabel.slice(0, 10)}...${rawLabel.slice(-8)}`
                  : rawLabel;

                parts.push(
                  <a
                    key={match.index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono font-bold text-bnb-yellow hover:underline break-all border border-bnb-yellow/40 bg-bnb-yellow/10 px-1.5 py-0.5 rounded text-[11px] my-0.5 hover:bg-bnb-yellow hover:text-black transition-colors"
                  >
                    <span>{displayLabel}</span>
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  </a>
                );
              } else {
                parts.push(token);
              }
            } 
            // 2. Inline Code: `code`
            else if (token.startsWith('`') && token.endsWith('`')) {
              const codeContent = token.slice(1, -1);
              // If it's a very long hash or address, shorten or break-all
              const isLongHex = codeContent.startsWith('0x') && codeContent.length > 20;
              const displayCode = isLongHex 
                ? `${codeContent.slice(0, 10)}...${codeContent.slice(-8)}` 
                : codeContent;

              parts.push(
                <code 
                  key={match.index} 
                  title={isLongHex ? codeContent : undefined}
                  className={`border px-1.5 py-0.5 text-[10px] font-mono rounded break-all inline-block max-w-full ${
                    isUser 
                      ? 'bg-background/20 border-background/40 text-background' 
                      : 'bg-card border-muted text-bnb-yellow'
                  }`}
                >
                  {displayCode}
                </code>
              );
            } 
            // 3. Bold: **text**
            else if (token.startsWith('**') && token.endsWith('**')) {
              parts.push(
                <strong key={match.index} className={`font-black ${isUser ? 'text-background underline' : 'text-foreground font-bold'}`}>
                  {token.slice(2, -2)}
                </strong>
              );
            } 
            // 4. Italic: *text*
            else if (token.startsWith('*') && token.endsWith('*')) {
              parts.push(
                <em key={match.index} className={`italic ${isUser ? 'text-background' : 'text-foreground'}`}>
                  {token.slice(1, -1)}
                </em>
              );
            }
            lastIdx = match.index + token.length;
          }

          if (lastIdx < str.length) {
            parts.push(str.substring(lastIdx));
          }

          return parts.length > 0 ? parts : str;
        };

        if (isBullet) {
          return (
            <div key={lIdx} className="flex items-start gap-1.5 ml-1 my-0.5 break-words overflow-hidden" style={{ overflowWrap: 'anywhere' }}>
              <span className={`font-black shrink-0 ${isUser ? 'text-background' : 'text-bnb-yellow'}`}>▸</span>
              <span className={isUser ? 'text-background' : 'text-foreground'}>{parseInline(textToParse)}</span>
            </div>
          );
        }

        return (
          <div key={lIdx} className={`${isUser ? 'text-background' : 'text-foreground'} break-words overflow-hidden`} style={{ overflowWrap: 'anywhere' }}>
            {parseInline(textToParse)}
          </div>
        );
      })}
    </div>
  );
}
