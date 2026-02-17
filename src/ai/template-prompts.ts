/**
 * Ultra-minimal template-specific prompts for maximum speed
 * CSS preservation is handled programmatically, not via prompts
 */

export interface TemplatePrompt {
  systemPrompt: string;
  userPromptTemplate: string;
}

const BASE_SYSTEM_PROMPT = `You are a resume data populator. Your ONLY job is to replace text content in HTML tags.

CRITICAL RULES:
1. Return ONLY complete HTML - no markdown, no explanations, no plain text outside tags
2. Preserve ALL CSS exactly - do NOT modify <style> blocks or any CSS
3. Preserve ALL HTML structure - keep all tags, classes, attributes exactly as provided
4. Only replace text content inside HTML tags (between > and <)
5. Remove placeholder text (John Doe, Lorem ipsum, etc.)
6. Do NOT duplicate content - each item appears once
7. Do NOT add plain text - all content must be inside proper HTML tags
8. NEVER include JavaScript code - no <script> tags, no JavaScript functions, no event listeners
9. Output ONLY HTML and CSS - no JavaScript whatsoever
10. INLINE STYLES: You MAY add inline style="..." attributes to elements when explicitly instructed by template-specific rules (e.g., for spacing optimization)`;

export function getTemplatePrompt(templateType: string): TemplatePrompt {
  const templateInstructions = getTemplateSpecificInstructions(templateType);
  
  const systemPrompt = `${BASE_SYSTEM_PROMPT}

${templateInstructions.system}`;

  return {
    systemPrompt,
    userPromptTemplate: templateInstructions.userTemplate
  };
}

function getTemplateSpecificInstructions(templateType: string): { system: string; userTemplate: string } {
  switch (templateType) {
    case 'OLIVE_GREEN_MODERN':
      return {
        system: `TEMPLATE: OLIVE_GREEN_MODERN
- Name → .header-left h1
- Role → .header-left .title
- Summary → .about-me p
- Experience → .left-column .work-experience .job
- Education → .left-column .education .education-item
- Skills → .right-column .skills section ul li
- Languages → .right-column .language section ul li
- Certifications → .right-column .certification section ul li
- Contact → .footer .footer-item span`,
        userTemplate: `Template:
{templateHtml}

Data:
Name: {name}
Role: {role}
Contact: {email}, {phone}, {location}
Summary: {summary}
Experience: {experiences}
Education: {education}
Skills: {skills}
Languages: {languages}

Replace text only. Preserve all CSS and HTML structure.`
      };

    case 'MODERN_PROFESSIONAL':
      return {
        system: `TEMPLATE: MODERN_PROFESSIONAL
- Name → .name-title .name
- Role → .name-title .job-title
- Contact → .left-column .section .contact-item
- Summary → .left-column .section .about-me-text
- Skills → .left-column .section .skills-list li
- Education/Experience → .right-column .section .timeline-container .timeline-item`,
        userTemplate: `Template:
{templateHtml}

Data:
Name: {name}
Role: {role}
Contact: {email}, {phone}, {location}
Summary: {summary}
Experience: {experiences}
Education: {education}
Skills: {skills}
Languages: {languages}

Replace text only. Preserve all CSS.`
      };

    case 'MINIMALIST_SIMPLE_PHOTO':
      return {
        system: `TEMPLATE: MINIMALIST_SIMPLE_PHOTO
- Name → .header-left h1
- Role → .header-left h2
- Contact → .header-left .contact-info p spans
- Summary → .column-right .section "ABOUT ME" .item-description
- Experience → .column-left .section "WORK EXPERIENCE" .work-item
- Education → .column-right .section "EDUCATION" .education-item
- Skills → .column-right .section "EXPERTISE"
- Languages → .column-right .section "LANGUAGE" .language-item`,
        userTemplate: `Template:
{templateHtml}

Data:
Name: {name}
Role: {role}
Contact: {email}, {phone}, {location}
Summary: {summary}
Experience: {experiences}
Education: {education}
Skills: {skills}
Languages: {languages}

Replace text only. DO NOT modify CSS colors, fonts, sizes, or layout.`
      };

    case '2_COLUMN_TIMELINE':
      return {
        system: `TEMPLATE: 2_COLUMN_TIMELINE
- Name → .right-header h1
- Role → .right-header .subtitle
- Summary → .right-header .summary
- Contact → .left-column .left-section "Contact" p
- Experience → .right-column .right-section "Experience" .timeline .timeline-item
- Education → .left-column .left-section "Education" .education-item
- Skills → .left-column .left-section "Expertise" .expertise-list li`,
        userTemplate: `Template:
{templateHtml}

Data:
Name: {name}
Role: {role}
Contact: {email}, {phone}, {location}
Summary: {summary}
Experience: {experiences}
Education: {education}
Skills: {skills}
Languages: {languages}

CRITICAL: Copy <style> block EXACTLY. Only replace text inside HTML tags.`
      };

    case 'COLORFUL_BLOCKS':
      return {
        system: `TEMPLATE: COLORFUL_BLOCKS
- Name → .right-column .header h1
- Role → .right-column .header .subtitle
- Summary → .right-column .header p
- Contact → .left-column .contact-info .contact-item
- Experience → .right-column .section "EXPERIENCE" .experience-item
- Education → .right-column .section "EDUCATION" .education-item
- Skills → .left-column .section "SKILLS" .skills-list li`,
        userTemplate: `Template:
{templateHtml}

Data:
Name: {name}
Role: {role}
Contact: {email}, {phone}, {location}
Summary: {summary}
Experience: {experiences}
Education: {education}
Skills: {skills}
Languages: {languages}

Replace text only. Preserve all CSS.`
      };

    case 'ELEGANT_PROFESSIONAL_PHOTO':
      return {
        system: `TEMPLATE: ELEGANT_PROFESSIONAL_PHOTO
- Name → .right-column h1
- Role → .right-column .subtitle
- Summary → .right-column .right-section "PERSONAL PROFILE" p
- Contact → .left-column .left-section "CONTACT" .contact-item
- Experience → .right-column .right-section "WORK EXPERIENCE"
- Education → .right-column .right-section "EDUCATION" .education-item
- Skills → .left-column .left-section "EXPERTISE" ul li`,
        userTemplate: `Template:
{templateHtml}

Data:
Name: {name}
Role: {role}
Contact: {email}, {phone}, {location}
Summary: {summary}
Experience: {experiences}
Education: {education}
Skills: {skills}
Languages: {languages}

Replace text only. Preserve all CSS.`
      };

    case 'BANDW_PROFESSIONAL':
      return {
        system: `TEMPLATE: BANDW_PROFESSIONAL
- Name → .header-info h1
- Role → .header-info .job-title
- Contact → .header-info .contact-info .contact-item
- Summary → .section "ABOUT ME" p
- Experience → .section "EXPERIENCE" .two-col-section
- Education → .section "EDUCATION" .two-col-section
- Skills → .section "SKILLS" .skills-grid ul li`,
        userTemplate: `Template:
{templateHtml}

Data:
Name: {name}
Role: {role}
Contact: {email}, {phone}, {location}
Summary: {summary}
Experience: {experiences}
Education: {education}
Skills: {skills}
Languages: {languages}

Replace text only. Preserve all CSS.`
      };

    case 'BLUE_SIMPLE_PROFILE':
      return {
        system: `TEMPLATE: BLUE_SIMPLE_PROFILE
- Name → .header-text h1
- Role → .header-text p
- Contact → .left-column .section "My Contact" .contact-item
- Summary → .right-column .section "About Me" .about-me-text
- Experience → .right-column .section "Professional Experience" .experience-item
- Education → .left-column .section "Education Background" .education-list .education-item
- Skills → .left-column .section "Hard Skill"/"Soft Skill" .skills-list li`,
        userTemplate: `Template:
{templateHtml}

Data:
Name: {name}
Role: {role}
Contact: {email}, {phone}, {location}
Summary: {summary}
Experience: {experiences}
Education: {education}
Skills: {skills}
Languages: {languages}

Replace text only. Preserve all CSS.`
      };

    case 'ACCENT_COLOR_MINIMAL':
      return {
        system: `TEMPLATE: ACCENT_COLOR_MINIMAL
- Name → .header-title h1
- Role → .header-title p
- Contact → .header .contact-info div
- Experience → .section "Work Experience" .section-content
- Education → .section "Education" .section-content
- Skills → .section "Expertise" .expertise-item

MANDATORY SPACING FIXES - YOU MUST ADD INLINE STYLES:
1. EVERY .section element MUST have style="margin-bottom: 10px" (or smaller: 8px)
2. EVERY .section-content element MUST have style="margin-bottom: 8px" (or smaller: 6px)
3. EVERY .section-title MUST have style="margin-bottom: 6px; padding-bottom: 2px"
4. EVERY .reference-item MUST have style="margin-bottom: 6px"
5. EVERY .expertise-item MUST have style="margin-bottom: 6px"
6. .header MUST have style="margin-bottom: 20px"
7. .section-content:last-child MUST have style="margin-bottom: 0px"
8. .section:last-child MUST have style="margin-bottom: 0px"
9. .reference-item:last-child MUST have style="margin-bottom: 0px"
10. .expertise-item:last-child MUST have style="margin-bottom: 0px"

CRITICAL PAGINATION RULES:
- Fill the first page completely - NO empty space on page 1
- Only move content to page 2 when page 1 is truly full
- If content goes to page 2, the first element MUST have style="margin-top: 0px"
- Remove ALL excessive spacing - use the inline styles above on EVERY element

PRESERVATION RULES:
- Keep all HTML structure, CSS classes, and <style> block exactly as provided
- Only modify text content AND add the mandatory inline spacing styles above`,
        userTemplate: `Template:
{templateHtml}

Data:
Name: {name}
Role: {role}
Contact: {email}, {phone}, {location}
Summary: {summary}
Experience: {experiences}
Education: {education}
Skills: {skills}
Languages: {languages}

MANDATORY: You MUST add inline style attributes to reduce spacing:

1. Add style="margin-bottom: 10px" to EVERY <div class="section"> element (use 8px if content is tight)
2. Add style="margin-bottom: 8px" to EVERY <div class="section-content"> element (use 6px if content is tight)
3. Add style="margin-bottom: 6px; padding-bottom: 2px" to EVERY <h2 class="section-title"> element
4. Add style="margin-bottom: 6px" to EVERY <div class="reference-item"> element
5. Add style="margin-bottom: 6px" to EVERY <div class="expertise-item"> element
6. Add style="margin-bottom: 20px" to <div class="header"> element
7. For last-child elements, add style="margin-bottom: 0px" to remove bottom spacing

EXAMPLE: 
Before: <div class="section" data-cid="...">
After: <div class="section" data-cid="..." style="margin-bottom: 10px">

CRITICAL PAGINATION:
- Fill page 1 completely - there must be NO empty space on the first page
- Only move content to page 2 when page 1 is completely full
- If any content appears on page 2, ensure the first element has style="margin-top: 0px"

PRESERVE: Keep all CSS classes, HTML structure, and the <style> block exactly as provided. Only replace text content AND add the mandatory inline spacing styles.`
      };

    default:
      return {
        system: `TEMPLATE: GENERIC
- Analyze structure and populate data
- Preserve ALL CSS and HTML structure
- Only replace text content`,
        userTemplate: `Template:
{templateHtml}

Data:
Name: {name}
Role: {role}
Contact: {email}, {phone}, {location}
Summary: {summary}
Experience: {experiences}
Education: {education}
Skills: {skills}
Languages: {languages}

Replace text only. Preserve all CSS.`
      };
  }
}
