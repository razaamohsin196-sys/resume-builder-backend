import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { CareerProfile, CareerIntent } from "../types";
import { getTemplatePrompt } from "./template-prompts";
import { postProcessTemplate } from "./template-post-processor";

/**
 * Extract only HTML content from LLM response
 * Removes markdown code blocks, explanations, and any non-HTML text
 */
function extractHtmlOnly(response: string): string {
  if (!response) return response;
  
  // Remove markdown code blocks
  let html = response.replace(/```html/g, '').replace(/```/g, '').trim();
  
  // Remove ALL JavaScript code blocks and script tags
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/```javascript[\s\S]*?```/gi, '');
  html = html.replace(/```js[\s\S]*?```/gi, '');
  
  // Remove JavaScript code that appears as plain text (common patterns)
  html = html.replace(/\/\/[^\n]*/g, ''); // Remove single-line comments
  html = html.replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments
  html = html.replace(/window\.(parent\.)?postMessage[\s\S]*?;/gi, '');
  html = html.replace(/addEventListener[\s\S]*?;/gi, '');
  html = html.replace(/ResizeObserver[\s\S]*?;/gi, '');
  html = html.replace(/querySelectorAll[\s\S]*?;/gi, '');
  html = html.replace(/setAttribute[\s\S]*?;/gi, '');
  html = html.replace(/createElement[\s\S]*?;/gi, '');
  html = html.replace(/appendChild[\s\S]*?;/gi, '');
  html = html.replace(/setTimeout[\s\S]*?;/gi, '');
  html = html.replace(/clearTimeout[\s\S]*?;/gi, '');
  html = html.replace(/function[\s\S]*?\{[\s\S]*?\}/g, '');
  html = html.replace(/\(function[\s\S]*?\)\s*\(\)\s*;/g, '');
  html = html.replace(/const\s+\w+\s*=\s*[\s\S]*?;/g, '');
  html = html.replace(/let\s+\w+\s*=\s*[\s\S]*?;/g, '');
  html = html.replace(/var\s+\w+\s*=\s*[\s\S]*?;/g, '');
  
  // Remove JavaScript that appears in text content (between tags)
  html = html.replace(/>([^<]*?)(Change Photo|wrapper\.appendChild|addEventListener|postMessage|ResizeObserver|querySelector|setAttribute|createElement|appendChild|setTimeout|clearTimeout|function\s*\(|const\s+\w+|let\s+\w+|var\s+\w+)[^<]*?</gi, (match, before, jsKeyword) => {
    // Only remove if it's clearly JavaScript, not legitimate text
    if (match.includes('(') || match.includes('{') || match.includes(';')) {
      return '>' + before + '<';
    }
    return match;
  });
  
  // Try to find HTML content - look for <style> or <!DOCTYPE or <div class="page"
  const htmlStartPatterns = [
    /<style[\s\S]*/i,
    /<!DOCTYPE[\s\S]*/i,
    /<div class="page"[\s\S]*/i,
    /<html[\s\S]*/i,
  ];
  
  for (const pattern of htmlStartPatterns) {
    const match = html.match(pattern);
    if (match) {
      html = match[0];
      break;
    }
  }
  
  // Remove any text before the first HTML tag
  const firstTagMatch = html.match(/<[^>]+>/);
  if (firstTagMatch) {
    const firstTagIndex = html.indexOf(firstTagMatch[0]);
    if (firstTagIndex > 0) {
      html = html.substring(firstTagIndex);
    }
  }
  
  // Remove any text after the last closing tag (if it looks like explanation text or JavaScript)
  const lastClosingTag = html.lastIndexOf('</html>');
  if (lastClosingTag > 0) {
    html = html.substring(0, lastClosingTag + 7);
  } else {
    // If no </html>, find last </div> or </style>
    const lastDiv = html.lastIndexOf('</div>');
    const lastStyle = html.lastIndexOf('</style>');
    const lastTag = Math.max(lastDiv, lastStyle);
    if (lastTag > 0) {
      // Check if there's explanatory text or JavaScript after
      const afterLastTag = html.substring(lastTag + 6).trim();
      if (afterLastTag && !afterLastTag.startsWith('<')) {
        html = html.substring(0, lastTag + 6);
      }
    }
  }
  
  // Final pass: Remove any remaining script tags
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  
  return html.trim();
}

/**
 * Remove all JavaScript from HTML output
 */
function removeJavaScript(html: string): string {
  if (!html) return html;
  
  try {
    // Remove script tags
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    
    // Remove JavaScript code that appears as plain text (the user's specific issue)
    // Remove everything from "Change Photo" to end of IIFE
    html = html.replace(/Change Photo['"][\s\S]*?\/\/ End IIFE/gi, '');
    html = html.replace(/Change Photo['"][\s\S]*?\}\)\(\);/gi, '');
    
    // Remove common JavaScript patterns in text content
    const jsPatterns = [
      /wrapper\.appendChild[\s\S]*?;/gi,
      /addEventListener\([\s\S]*?\)[\s\S]*?;/gi,
      /postMessage\([\s\S]*?\)[\s\S]*?;/gi,
      /ResizeObserver[\s\S]*?;/gi,
      /querySelectorAll[\s\S]*?;/gi,
      /setAttribute[\s\S]*?;/gi,
      /createElement[\s\S]*?;/gi,
      /appendChild[\s\S]*?;/gi,
      /setTimeout[\s\S]*?;/gi,
      /clearTimeout[\s\S]*?;/gi,
      /activeProfileImage[\s\S]*?;/gi,
      /debounceTimer[\s\S]*?;/gi,
      /\(function[\s\S]*?\)\s*\(\)\s*;/gi,
      /function\s+\w+\s*\([^)]*\)\s*\{[\s\S]*?\}/gi,
      /const\s+\w+\s*=\s*[\s\S]*?;/gi,
      /let\s+\w+\s*=\s*[\s\S]*?;/gi,
      /var\s+\w+\s*=\s*[\s\S]*?;/gi,
      /window\.(parent\.)?postMessage[\s\S]*?;/gi,
      /document\.(querySelector|createElement|addEventListener)[\s\S]*?;/gi,
    ];
    
    for (const pattern of jsPatterns) {
      html = html.replace(pattern, '');
    }
    
    // Remove JavaScript that appears between HTML tags (in text content)
    html = html.replace(/>([^<]*?)(Change Photo|wrapper|addEventListener|postMessage|ResizeObserver|querySelector|setAttribute|createElement|appendChild|setTimeout|clearTimeout|function|const\s+\w+|let\s+\w+|var\s+\w+|window\.|document\.|activeProfileImage|debounceTimer)[^<]*?</gi, (match) => {
      // If it contains JavaScript syntax, remove the JavaScript part
      if (match.includes('(') || match.includes('{') || match.includes(';') || match.includes('=>') || match.includes('=')) {
        // Keep only the opening tag
        const tagMatch = match.match(/^[^>]*>/);
        return tagMatch ? tagMatch[0] + '<' : '><';
      }
      return match;
    });
    
    // Remove any remaining standalone JavaScript statements
    html = html.replace(/[^<>\s]+\.(addEventListener|postMessage|querySelector|setAttribute|createElement|appendChild|setTimeout|clearTimeout)\([^)]*\)[\s\S]*?;/g, '');
    
    return html;
  } catch (error) {
    console.error('[removeJavaScript] Error:', error);
    return html;
  }
}

/**
 * Apply deduplication to HTML to remove duplicate content
 * Specifically handles olive green template and other templates
 */
function applyDeduplication(html: string): string {
  if (!html) return html;
  return inlineDeduplicateHtml(html);
}

/**
 * Inline deduplication for HTML
 * Specifically handles olive green template structure and other common patterns
 */
function inlineDeduplicateHtml(html: string): string {
  if (!html) return html;
  
  try {
    // For olive green template: Remove duplicate job items
    // Pattern: <div class="job" data-cid="...">...</div> appears multiple times with same content
    const jobSectionPattern = /<section[^>]*class="work-experience"[^>]*>([\s\S]*?)<\/section>/i;
    const jobSectionMatch = html.match(jobSectionPattern);
    
    if (jobSectionMatch) {
      const jobSection = jobSectionMatch[0];
      const jobPattern = /<div class="job"[^>]*>([\s\S]*?)<\/div>/g;
      const seenJobs = new Map<string, string>();
      const jobs: Array<{ html: string; content: string }> = [];
      
      let match;
      while ((match = jobPattern.exec(jobSection)) !== null) {
        const jobHtml = match[0];
        const jobContent = match[1]
          .replace(/data-cid="[^"]*"/g, '') // Remove data-cid attributes for comparison
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        
        if (!seenJobs.has(jobContent)) {
          seenJobs.set(jobContent, jobHtml);
          jobs.push({ html: jobHtml, content: jobContent });
        }
      }
      
      // If we found duplicates, replace the section with deduplicated version
      if (jobs.length < (jobSection.match(/<div class="job"/g) || []).length) {
        const deduplicatedSection = jobSection.replace(
          /<div class="job"[^>]*>[\s\S]*?<\/div>/g,
          (match) => {
            const normalized = match
              .replace(/data-cid="[^"]*"/g, '')
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase();
            return seenJobs.has(normalized) ? match : '';
          }
        );
        html = html.replace(jobSection, deduplicatedSection);
      }
    }
    
    // Remove duplicate list items (works for all templates)
    const listItemPattern = /<li[^>]*>([\s\S]*?)<\/li>/g;
    const seenListItems = new Set<string>();
    
    html = html.replace(listItemPattern, (match, content) => {
      const normalized = content
        .replace(/data-cid="[^"]*"/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      
      if (normalized.length > 5 && seenListItems.has(normalized)) {
        return ''; // Remove duplicate
      }
      seenListItems.add(normalized);
      return match;
    });
    
    // Remove duplicate paragraphs
    const paragraphPattern = /<p[^>]*>([\s\S]*?)<\/p>/g;
    const seenParagraphs = new Set<string>();
    
    html = html.replace(paragraphPattern, (match, content) => {
      const normalized = content
        .replace(/data-cid="[^"]*"/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      
      if (normalized.length > 10 && seenParagraphs.has(normalized)) {
        return ''; // Remove duplicate
      }
      seenParagraphs.add(normalized);
      return match;
    });
    
    // Remove duplicate education items (for olive green template)
    const educationSectionPattern = /<section[^>]*class="education"[^>]*>([\s\S]*?)<\/section>/i;
    const educationSectionMatch = html.match(educationSectionPattern);
    
    if (educationSectionMatch) {
      const educationSection = educationSectionMatch[0];
      const educationPattern = /<div class="education-item"[^>]*>([\s\S]*?)<\/div>/g;
      const seenEducation = new Set<string>();
      
      const deduplicatedEducation = educationSection.replace(educationPattern, (match, content) => {
        const normalized = content
          .replace(/data-cid="[^"]*"/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        
        if (seenEducation.has(normalized)) {
          return ''; // Remove duplicate
        }
        seenEducation.add(normalized);
        return match;
      });
      
      if (deduplicatedEducation !== educationSection) {
        html = html.replace(educationSection, deduplicatedEducation);
      }
    }
    
    return html;
  } catch (error) {
    console.error('[inlineDeduplicateHtml] Error:', error);
    return html; // Return original on error
  }
}

// Initialize API clients lazily
function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  return key ? new GoogleGenerativeAI(key) : null;
}

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  return key ? new OpenAI({ apiKey: key }) : null;
}

/**
 * Populate and fix an existing template HTML with resume data
 * Preserves the template's styling while fixing spacing, formatting, and layout issues
 */
/**
 * Extract and preserve original style block(s) from template
 * Handles multiple style blocks by combining them
 * Preserves @import statements and all CSS
 */
function extractOriginalStyleBlock(html: string): string | null {
  const styleMatches = html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  const styles: string[] = [];
  for (const match of styleMatches) {
    styles.push(match[0]);
  }
  return styles.length > 0 ? styles.join('\n') : null;
}

/**
 * Re-inject original style block into generated HTML
 * Ensures proper placement in <head> or before <body>
 */
function preserveOriginalStyles(generatedHtml: string, originalStyleBlock: string | null): string {
  if (!originalStyleBlock) return generatedHtml;
  
  // Remove any style blocks from generated HTML (LLM might have added its own)
  let cleaned = generatedHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Try to find and preserve the head structure
  const headMatch = cleaned.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  
  if (headMatch) {
    // If head exists, inject style block before closing </head>
    cleaned = cleaned.replace('</head>', originalStyleBlock + '\n</head>');
  } else if (cleaned.includes('<body')) {
    // If no head but body exists, inject before body
    cleaned = cleaned.replace('<body', originalStyleBlock + '\n<body');
  } else if (cleaned.includes('<!DOCTYPE')) {
    // If DOCTYPE exists, try to find where to insert
    // Look for <html> tag
    const htmlTagMatch = cleaned.match(/<html[^>]*>/i);
    if (htmlTagMatch) {
      // Insert after <html> tag
      const afterHtml = cleaned.indexOf(htmlTagMatch[0]) + htmlTagMatch[0].length;
      // Check if there's already a <head> opening
      const headOpenMatch = cleaned.substring(afterHtml).match(/<head[^>]*>/i);
      if (headOpenMatch) {
        // Insert after <head> opening
        const headOpenPos = afterHtml + cleaned.substring(afterHtml).indexOf(headOpenMatch[0]) + headOpenMatch[0].length;
        cleaned = cleaned.substring(0, headOpenPos) + '\n' + originalStyleBlock + '\n' + cleaned.substring(headOpenPos);
      } else {
        // Create head structure
        cleaned = cleaned.substring(0, afterHtml) + '\n<head>\n' + originalStyleBlock + '\n</head>\n' + cleaned.substring(afterHtml);
      }
    } else {
      // No html tag, insert after DOCTYPE
      const doctypeMatch = cleaned.match(/<!DOCTYPE[^>]*>/i);
      if (doctypeMatch) {
        const afterDoctype = cleaned.indexOf(doctypeMatch[0]) + doctypeMatch[0].length;
        cleaned = cleaned.substring(0, afterDoctype) + '\n<html>\n<head>\n' + originalStyleBlock + '\n</head>\n<body>\n' + cleaned.substring(afterDoctype) + '\n</body>\n</html>';
      }
    }
  } else {
    // No structure found, prepend with proper HTML structure
    cleaned = '<!DOCTYPE html>\n<html>\n<head>\n' + originalStyleBlock + '\n</head>\n<body>\n' + cleaned + '\n</body>\n</html>';
  }
  
  return cleaned;
}

export async function populateAndFixTemplate(
  templateHtml: string,
  profile: CareerProfile,
  intent: CareerIntent,
  options?: { fitToOnePage?: boolean; hasPhoto?: boolean; onChunk?: (chunk: string) => void; templateStyle?: string; templateId?: string }
): Promise<string> {
  // Extract and preserve original style block BEFORE processing
  const originalStyleBlock = extractOriginalStyleBlock(templateHtml);
  
  if (!originalStyleBlock) {
    console.warn('[populateAndFixTemplate] No style block found in template HTML - CSS may not be preserved');
  } else {
    console.log(`[populateAndFixTemplate] Extracted style block (${originalStyleBlock.length} chars) for preservation`);
  }
  
  // Extract structured data
  const name = profile.personal?.name || "";
  const location = profile.personal?.location || "";
  const email = profile.contact?.email || "";
  const phone = profile.contact?.phone || "";
  const linkedin = profile.contact?.linkedin || "";
  const github = profile.contact?.github || "";
  const website = profile.contact?.website || "";
  const summary = profile.summary || "";
  
  // Categorize items
  const experiences = profile.items?.filter(item => 
    item.category === "role" || item.category === "experience"
  ) || [];
  
  const education = profile.items?.filter(item => 
    item.category === "education"
  ) || [];
  
  const skills = profile.items?.filter(item => 
    item.category === "skill"
  ) || [];
  
  const projects = profile.items?.filter(item => 
    item.category === "project"
  ) || [];
  
  const certifications = profile.items?.filter(item => 
    item.category === "certification"
  ) || [];
  
  const languages = profile.items?.filter(item => 
    item.category === "language"
  ) || [];

  // Map templateId to template type constant (most reliable)
  const mapTemplateIdToType = (templateId?: string): string | null => {
    if (!templateId) return null;
    const id = templateId.toLowerCase().trim();
    
    // Map actual template IDs from frontend to template types
    if (id === 'olivegreenmodern') return 'OLIVE_GREEN_MODERN';
    if (id === 'modernprofessional') return 'MODERN_PROFESSIONAL';
    if (id === 'minimalistsimplephoto') return 'MINIMALIST_SIMPLE_PHOTO';
    if (id === '2columntimeline' || id === 'template2columntimeline') return '2_COLUMN_TIMELINE';
    if (id === 'colorfulblocks') return 'COLORFUL_BLOCKS';
    if (id === 'elegantprofessionalphoto') return 'ELEGANT_PROFESSIONAL_PHOTO';
    if (id === 'bandwprofessional') return 'BANDW_PROFESSIONAL';
    if (id === 'bluesimpleprofile') return 'BLUE_SIMPLE_PROFILE';
    if (id === 'accentcolorminimal') return 'ACCENT_COLOR_MINIMAL';
    if (id === '2columnminimal' || id === 'template2columnminimal') return '2_COLUMN_TIMELINE';
    if (id === 'classic') return 'MODERN_PROFESSIONAL';
    if (id === 'template2columnstylishblocks') return 'COLORFUL_BLOCKS';
    
    // Fallback: handle variations with dashes/underscores
    if (id.includes('olive') && id.includes('green')) return 'OLIVE_GREEN_MODERN';
    if (id.includes('modern') && id.includes('professional')) return 'MODERN_PROFESSIONAL';
    if (id.includes('minimalist') && (id.includes('photo') || id.includes('simple'))) return 'MINIMALIST_SIMPLE_PHOTO';
    if (id.includes('timeline') && (id.includes('2') || id.includes('column'))) return '2_COLUMN_TIMELINE';
    if (id.includes('colorful') || id.includes('blocks')) return 'COLORFUL_BLOCKS';
    if (id.includes('elegant') && id.includes('photo')) return 'ELEGANT_PROFESSIONAL_PHOTO';
    if (id.includes('bandw') || id.includes('bw') || (id.includes('black') && id.includes('white'))) return 'BANDW_PROFESSIONAL';
    if (id.includes('blue') && id.includes('simple')) return 'BLUE_SIMPLE_PROFILE';
    if (id.includes('accent') && id.includes('minimal')) return 'ACCENT_COLOR_MINIMAL';
    
    return null;
  };

  // Map templateStyle string to template type constant
  const mapTemplateStyleToType = (templateStyle?: string): string | null => {
    if (!templateStyle) return null;
    const style = templateStyle.toLowerCase().trim();
    
    // Map exact template names from frontend
    if (style === 'olive green modern' || style === 'olivegreenmodern') return 'OLIVE_GREEN_MODERN';
    if (style === 'modern professional' || style === 'modernprofessional') return 'MODERN_PROFESSIONAL';
    if (style === 'minimalist simple photo' || style === 'minimalistsimplephoto') return 'MINIMALIST_SIMPLE_PHOTO';
    if (style === '2 column timeline' || style === '2columntimeline' || style === 'template2columntimeline') return '2_COLUMN_TIMELINE';
    if (style === 'colorful blocks' || style === 'colorfulblocks') return 'COLORFUL_BLOCKS';
    if (style === 'elegant professional photo' || style === 'elegantprofessionalphoto') return 'ELEGANT_PROFESSIONAL_PHOTO';
    if (style === 'b&w professional' || style === 'bandwprofessional' || style === 'bw professional') return 'BANDW_PROFESSIONAL';
    if (style === 'blue simple profile' || style === 'bluesimpleprofile') return 'BLUE_SIMPLE_PROFILE';
    if (style === 'accent color minimal' || style === 'accentcolorminimal') return 'ACCENT_COLOR_MINIMAL';
    if (style === '2 column minimal' || style === '2columnminimal' || style === 'template2columnminimal') return '2_COLUMN_TIMELINE';
    if (style === 'classic') return 'MODERN_PROFESSIONAL';
    
    // Fallback: partial matching for flexibility
    if (style.includes('olive') && style.includes('green')) return 'OLIVE_GREEN_MODERN';
    if (style.includes('modern') && style.includes('professional')) return 'MODERN_PROFESSIONAL';
    if (style.includes('minimalist') && (style.includes('photo') || style.includes('simple'))) return 'MINIMALIST_SIMPLE_PHOTO';
    if (style.includes('timeline') || (style.includes('2') && style.includes('column') && style.includes('timeline'))) return '2_COLUMN_TIMELINE';
    if (style.includes('colorful') || style.includes('blocks')) return 'COLORFUL_BLOCKS';
    if (style.includes('elegant') && style.includes('photo')) return 'ELEGANT_PROFESSIONAL_PHOTO';
    if (style.includes('b&w') || style.includes('bw') || (style.includes('black') && style.includes('white'))) return 'BANDW_PROFESSIONAL';
    if (style.includes('blue') && style.includes('simple')) return 'BLUE_SIMPLE_PROFILE';
    if (style.includes('accent') && style.includes('minimal')) return 'ACCENT_COLOR_MINIMAL';
    
    return null;
  };

  // Detect template type - prefer templateStyle, fallback to HTML detection
  const detectTemplateType = (html: string): string => {
    if (html.includes('.left-column') && html.includes('#3D3D78') && html.includes('.timeline')) return '2_COLUMN_TIMELINE';
    if (html.includes('.header-left') && html.includes('.column-left') && html.includes('flex: 1.5')) return 'MINIMALIST_SIMPLE_PHOTO';
    if (html.includes('.name-title') && html.includes('.timeline-container')) return 'MODERN_PROFESSIONAL';
    if (html.includes('.header-left') && html.includes('.arrow-icon-wrapper')) return 'OLIVE_GREEN_MODERN';
    if (html.includes('#A97C74') && html.includes('.date-badge')) return 'COLORFUL_BLOCKS';
    if (html.includes('#F7E6E5') && html.includes('.image-container') && html.includes('.signature')) return 'ELEGANT_PROFESSIONAL_PHOTO';
    if (html.includes('.two-col-section') && html.includes('.skills-grid')) return 'BANDW_PROFESSIONAL';
    if (html.includes('#1237a9') && html.includes('.header-bg')) return 'BLUE_SIMPLE_PROFILE';
    if (html.includes('.expertise-bar') && html.includes('#57b5b2')) return 'ACCENT_COLOR_MINIMAL';
    return 'GENERIC';
  };

  // Use templateId first (most reliable), then templateStyle, then detect from HTML
  const templateTypeFromId = mapTemplateIdToType(options?.templateId);
  const templateTypeFromStyle = mapTemplateStyleToType(options?.templateStyle);
  const templateType = templateTypeFromId || templateTypeFromStyle || detectTemplateType(templateHtml);
  
  console.log(`Template detection: id="${options?.templateId}", style="${options?.templateStyle}", detected type="${templateType}"`);

  // Clean template HTML before sending to LLM (remove any JavaScript)
  const cleanedTemplateHtml = removeJavaScript(templateHtml);
  
  // Get optimized template-specific prompt
  const templatePrompt = getTemplatePrompt(templateType);
  const systemPrompt = templatePrompt.systemPrompt;

  // Format user prompt with data
  const formatExperiences = (exps: typeof experiences) => exps.map(exp => 
    `- Title: ${exp.title}\n  Company: ${exp.organization || ''}\n  Dates: ${exp.dates || `${exp.startDate || ''} - ${exp.endDate || (exp.current ? 'Present' : '')}`}\n  Description: ${exp.description || ''}`
  ).join('\n');

  const formatEducation = (edu: typeof education) => edu.map(e => 
    `- Degree: ${e.title}\n  School: ${e.organization || ''}\n  Dates: ${e.dates || `${e.startDate || ''} - ${e.endDate || ''}`}\n  Description: ${e.description || ''}`
  ).join('\n');

  const formatSkills = (sk: typeof skills) => sk.map(s => `- ${s.title}`).join('\n');

  const formatLanguages = (langs: typeof languages) => langs.length > 0 
    ? langs.map(lang => {
        const proficiency = lang.organization || lang.description || 'Proficient';
        return `- ${lang.title} - ${proficiency}`;
      }).join('\n')
    : '- No languages specified';

  const role = intent.targetRole || '';

  const userPrompt = templatePrompt.userPromptTemplate
    .replace('{templateHtml}', cleanedTemplateHtml)
    .replace('{name}', name)
    .replace('{role}', role)
    .replace('{location}', location)
    .replace('{email}', email)
    .replace('{phone}', phone)
    .replace('{linkedin}', linkedin)
    .replace('{github}', github)
    .replace('{website}', website)
    .replace('{summary}', summary)
    .replace('{experiences}', formatExperiences(experiences))
    .replace('{education}', formatEducation(education))
    .replace('{skills}', formatSkills(skills))
    .replace('{languages}', formatLanguages(languages));

  try {
    // Prefer OpenAI if available (use gpt-4o-mini for faster responses)
    const openai = getOpenAI();
    if (openai) {
      const modelName = "gpt-4o-mini";
      console.log(`Using OpenAI (${modelName}) to populate and fix template${options?.onChunk ? ' with streaming' : ''}`);
      const apiStartTime = Date.now();
      
      // If streaming is requested, use streaming API
      if (options?.onChunk) {
        const stream = await openai.chat.completions.create({
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 16000,
          top_p: 0.9,
          stream: true,
        });

        let html = '';
        let hasStartedHtml = false;
        let buffer = '';
        
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            html += content;
            buffer += content;
            
            // Check if we've started the HTML document
            if (!hasStartedHtml) {
              const trimmed = buffer.trim();
              // Only start streaming once we have <!DOCTYPE, <style>, or <html>
              if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<style') || trimmed.startsWith('<html') || trimmed.startsWith('<div')) {
                hasStartedHtml = true;
                // Send the buffered content from the HTML start
                const htmlStart = buffer.indexOf('<');
                if (htmlStart >= 0) {
                  options.onChunk(buffer.substring(htmlStart));
                } else {
                  options.onChunk(buffer);
                }
                buffer = '';
              }
            } else {
              // HTML has started, stream all new content
              options.onChunk(content);
            }
          }
        }
        
        // If HTML never started properly, try to extract and send HTML from the response
        if (!hasStartedHtml && html.trim()) {
          const extracted = extractHtmlOnly(html);
          if (extracted) {
            options.onChunk(extracted);
          }
        }

        const apiTime = Date.now() - apiStartTime;
        console.log(`OpenAI streaming API call completed in ${apiTime}ms`);

        // Extract only HTML content - remove any markdown, explanations, or non-HTML text
        html = extractHtmlOnly(html);
        
        // Remove all JavaScript code
        html = removeJavaScript(html);
        
        // CRITICAL: Re-inject original style block to preserve all CSS
        html = preserveOriginalStyles(html, originalStyleBlock);
        console.log(`[populateAndFixTemplate] Re-injected style block into generated HTML`);
        
        // Apply post-processing (spacing fixes, deduplication, etc.)
        html = postProcessTemplate(html, templateType);
        html = applyDeduplication(html);
        
        return html;
      } else {
        // Non-streaming path
        const response = await openai.chat.completions.create({
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 16000,
          top_p: 0.9,
        });

        const apiTime = Date.now() - apiStartTime;
        console.log(`OpenAI API call completed in ${apiTime}ms`);

        let html = response.choices[0]?.message?.content?.trim() || '';
        
        // Extract only HTML content - remove any markdown, explanations, or non-HTML text
        html = extractHtmlOnly(html);
        
        // Remove all JavaScript code
        html = removeJavaScript(html);
        
        // CRITICAL: Re-inject original style block to preserve all CSS
        html = preserveOriginalStyles(html, originalStyleBlock);
        console.log(`[populateAndFixTemplate] Re-injected style block into generated HTML`);
        
        // Apply post-processing (spacing fixes, deduplication, etc.)
        html = postProcessTemplate(html, templateType);
        html = applyDeduplication(html);
        
        return html;
      }
    }

    // Fallback to Gemini if OpenAI is not available
    const genAI = getGenAI();
    if (genAI) {
      console.log(`Using Gemini to populate and fix template${options?.onChunk ? ' with streaming' : ''}`);
      const apiStartTime = Date.now();
      
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash-exp",
        generationConfig: {
          responseMimeType: "text/plain",
          temperature: 0.1,
          maxOutputTokens: 16000,
          topP: 0.9,
        }
      });

      // If streaming is requested, use streaming API
      if (options?.onChunk) {
        let html = '';
        const result = await model.generateContentStream({
          contents: [
            { role: "model", parts: [{ text: systemPrompt }] },
            { role: "user", parts: [{ text: userPrompt }] }
          ]
        });

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            html += text;
            options.onChunk(text);
          }
        }

        const apiTime = Date.now() - apiStartTime;
        console.log(`Gemini streaming API call completed in ${apiTime}ms`);

        // Extract only HTML content - remove any markdown, explanations, or non-HTML text
        html = extractHtmlOnly(html);
        
        // Remove all JavaScript code
        html = removeJavaScript(html);
        
        // CRITICAL: Re-inject original style block to preserve all CSS
        html = preserveOriginalStyles(html, originalStyleBlock);
        console.log(`[populateAndFixTemplate] Re-injected style block into generated HTML`);
        
        // Apply post-processing (spacing fixes, deduplication, etc.)
        html = postProcessTemplate(html, templateType);
        html = applyDeduplication(html);
        
        return html;
      } else {
        // Non-streaming path
        const result = await model.generateContent({
          contents: [
            { role: "model", parts: [{ text: systemPrompt }] },
            { role: "user", parts: [{ text: userPrompt }] }
          ]
        });

        const apiTime = Date.now() - apiStartTime;
        console.log(`Gemini API call completed in ${apiTime}ms`);

        let html = result.response.text().trim();
        
        // Extract only HTML content - remove any markdown, explanations, or non-HTML text
        html = extractHtmlOnly(html);
        
        // Remove all JavaScript code
        html = removeJavaScript(html);
        
        // CRITICAL: Re-inject original style block to preserve all CSS
        html = preserveOriginalStyles(html, originalStyleBlock);
        console.log(`[populateAndFixTemplate] Re-injected style block into generated HTML`);
        
        // Apply post-processing (spacing fixes, deduplication, etc.)
        html = postProcessTemplate(html, templateType);
        html = applyDeduplication(html);
        
        return html;
      }
    }

    throw new Error("No AI provider available");
  } catch (error: any) {
    console.error("Error populating and fixing template:", error);
    throw new Error(`Failed to populate and fix template: ${error.message}`);
  }
}
