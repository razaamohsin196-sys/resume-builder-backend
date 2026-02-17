/**
 * Post-processing functions for template fixes
 * These are done after LLM processing to avoid adding to prompt size and processing time
 */

/**
 * Fix spacing issues in HTML
 */
export function fixSpacing(html: string, templateType: string): string {
  if (!html) return html;

  try {
    // Remove empty spaces below last sections
    // Add CSS rule to remove margin-bottom from last section
    const lastSectionFix = `
      <style>
        .section:last-child { margin-bottom: 0 !important; }
        .left-column .section:last-child { margin-bottom: 0 !important; }
        .right-column .section:last-child { margin-bottom: 0 !important; }
        .column-left .section:last-child { margin-bottom: 0 !important; }
        .column-right .section:last-child { margin-bottom: 0 !important; }
      </style>
    `;

    // Insert before closing </head> or </style>, or at the end of <style> block
    if (html.includes('</style>')) {
      html = html.replace('</style>', lastSectionFix + '</style>');
    } else if (html.includes('</head>')) {
      html = html.replace('</head>', lastSectionFix + '</head>');
    } else {
      // If no head/style, add at the beginning
      html = lastSectionFix + html;
    }

    return html;
  } catch (error) {
    console.error('[fixSpacing] Error:', error);
    return html;
  }
}

/**
 * Balance columns for two-column layouts
 */
export function balanceColumns(html: string, templateType: string): string {
  if (!html) return html;

  // This is a simplified version - full column balancing would require DOM parsing
  // For now, we'll let the LLM handle it, but we can add CSS hints here
  try {
    const columnBalanceCSS = `
      <style>
        .left-column, .right-column, .column-left, .column-right {
          display: flex;
          flex-direction: column;
        }
      </style>
    `;

    if (html.includes('</style>')) {
      html = html.replace('</style>', columnBalanceCSS + '</style>');
    }

    return html;
  } catch (error) {
    console.error('[balanceColumns] Error:', error);
    return html;
  }
}

/**
 * Remove placeholder text that might have been missed
 */
export function removePlaceholders(html: string): string {
  if (!html) return html;

  const placeholderPatterns = [
    /becky\s+shu/gi,
    /beckyhsiung96/gi,
    /john\s+doe/gi,
    /jane\s+doe/gi,
    /lorem\s+ipsum/gi,
    /example\.com/gi,
    /placeholder/gi,
    /\[Your\s+Name\]/gi,
    /\[Your\s+Title\]/gi,
    /\[Your\s+Email\]/gi,
  ];

  let cleaned = html;
  for (const pattern of placeholderPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned;
}

/**
 * Apply all post-processing fixes
 */
export function postProcessTemplate(
  html: string,
  templateType: string
): string {
  if (!html) return html;

  let processed = html;

  // Apply deduplication (already exists in template-fixer.ts, but we can call it here)
  // processed = applyDeduplication(processed);

  // Fix spacing
  processed = fixSpacing(processed, templateType);

  // Balance columns (add CSS hints)
  processed = balanceColumns(processed, templateType);

  // Remove placeholders
  processed = removePlaceholders(processed);

  return processed;
}
