import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { CareerProfile, CareerIntent } from "../types";

/**
 * Extract only HTML content from LLM response
 * Removes markdown code blocks, explanations, and any non-HTML text
 */
function extractHtmlOnly(response: string): string {
  if (!response) return response;
  
  // Remove markdown code blocks
  let html = response.replace(/```html/g, '').replace(/```/g, '').trim();
  
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
  
  // Remove any text after the last closing tag (if it looks like explanation text)
  const lastClosingTag = html.lastIndexOf('</html>');
  if (lastClosingTag > 0) {
    html = html.substring(0, lastClosingTag + 7);
  } else {
    // If no </html>, find last </div> or </style>
    const lastDiv = html.lastIndexOf('</div>');
    const lastStyle = html.lastIndexOf('</style>');
    const lastTag = Math.max(lastDiv, lastStyle);
    if (lastTag > 0) {
      // Check if there's explanatory text after
      const afterLastTag = html.substring(lastTag + 6).trim();
      if (afterLastTag && !afterLastTag.startsWith('<')) {
        html = html.substring(0, lastTag + 6);
      }
    }
  }
  
  return html.trim();
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
export async function populateAndFixTemplate(
  templateHtml: string,
  profile: CareerProfile,
  intent: CareerIntent,
  options?: { fitToOnePage?: boolean; hasPhoto?: boolean; onChunk?: (chunk: string) => void; templateStyle?: string; templateId?: string }
): Promise<string> {
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
    if (id === '2columnminimal' || id === 'template2columnminimal') return '2_COLUMN_TIMELINE'; // Similar structure
    if (id === 'classic') return 'MODERN_PROFESSIONAL'; // Similar to modern professional
    if (id === 'template2columnstylishblocks') return 'COLORFUL_BLOCKS'; // Similar structure
    
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
    if (style === '2 column minimal' || style === '2columnminimal' || style === 'template2columnminimal') return '2_COLUMN_TIMELINE'; // Similar structure
    if (style === 'classic') return 'MODERN_PROFESSIONAL'; // Similar to modern professional
    
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

  const systemPrompt = `You are an expert HTML/CSS resume template fixer. 

**ABSOLUTE CRITICAL OUTPUT REQUIREMENT - READ THIS FIRST:**
- Your ENTIRE response must be ONLY the complete HTML document
- Start IMMEDIATELY with <!DOCTYPE html> or <style> - NO other text before it
- Return the COMPLETE HTML document in one response - do NOT generate partial CSS fragments
- Do NOT generate individual CSS properties like "mask-repeat" or "mask: no-repeat;" as separate chunks
- The HTML must include the FULL <style> block first, then the complete <body> content
- NO markdown, NO explanations, NO comments, NO text outside HTML tags
- If you include ANY text before <!DOCTYPE html> or <style>, your response is WRONG

Your task is to take an existing resume template HTML (exactly as provided) and:

1. Populate it with the provided resume data
2. Fix all formatting, spacing, and layout issues
3. PRESERVE the template's original styling, colors, fonts, and design

The template HTML you receive contains ALL the styling, structure, and formatting. Your job is to:
- Keep ALL CSS exactly as it is (colors, fonts, spacing rules)
- Keep ALL HTML structure and class names
- Only modify CONTENT (text values) and fix LAYOUT issues (spacing, column balance)
- **ABSOLUTELY CRITICAL for 2 COLUMN TIMELINE template**: The entire <style> block must be preserved EXACTLY as provided - do NOT modify, remove, or rewrite any CSS rules, properties, or values. Only change text content inside HTML tags.

FIRST: DETECT THE TEMPLATE TYPE by analyzing the HTML structure:
- **OLIVE GREEN MODERN**: Has .header-left h1, .header-left .title, .main-content with .left-column/.right-column (50% each), .footer with position: absolute
- **MODERN PROFESSIONAL**: Has .name-title .name, .name-title .job-title, .left-column (40% width, gray background), .right-column (65% width), .timeline-container, .timeline-item
- **MINIMALIST SIMPLE PHOTO**: Has .header with .header-left/.header-right, .header-left h1/h2, .contact-info, .main-content with .column-left (flex: 1.5) and .column-right (flex: 1), .work-item, .education-item
- **2 COLUMN TIMELINE**: Has .left-column (33% width, background-color: #3D3D78), .right-column (67% width, with borders), .timeline (with ::before vertical line), .timeline-item (with ::before circle), .left-section with .divider, .right-header, .right-content
- **COLORFUL BLOCKS**: Has .header with background-color: #A97C74, .left-column (38% width) with .profile-pic-container, .contact-info, .right-column (62% width) with .header, .date-badge, .footer-bar
- **ELEGANT PROFESSIONAL PHOTO**: Has .left-column (30% width) with .image-container (#F7E6E5 background), .right-column (70% width) with .signature, .right-section, .job-title, .job-details, .job-description
- **B&W PROFESSIONAL**: Has .header with .profile-pic and .header-info, .contact-info with .contact-phone/.contact-email/.contact-web, .two-col-section with .left-col/.right-col, .skills-grid (4 columns), .references-grid (2 columns)
- **BLUE SIMPLE PROFILE**: Has .header-bg and .footer-bg with background-color: #1237a9, .header-text with h1/p, .profile-pic positioned absolutely, .main-content with .left-column (250px) and .right-column (416px), .skills-list, .education-list, .experience-item
- **ACCENT COLOR MINIMAL**: Has .header with .profile-pic, .header-title, .contact-info, .section-content with .left-column (25%) and .right-column (75%), .section-title with ::after dashed line, .expertise-item with .expertise-bar

CRITICAL RULES:
1. **PRESERVE ALL STYLING**: Keep ALL CSS classes, IDs, color schemes, fonts, and visual design exactly as they are in the template. Do NOT change the template's aesthetic.
   - **ESPECIALLY CRITICAL for MINIMALIST SIMPLE PHOTO and 2 COLUMN TIMELINE**: These templates have specific styling that MUST be preserved exactly:
     * MINIMALIST SIMPLE PHOTO: Preserve header background-color: #F6F6F6, header height: 250px, column flex values (1.5 and 1), section-title ::after underline styling
     * 2 COLUMN TIMELINE: Preserve left-column background-color: #3D3D78, right-column borders (10px solid #3D3D78), timeline ::before vertical line, timeline-item ::before circles, all color values
   - DO NOT modify any CSS properties for these two templates - only modify content text

2. **DYNAMIC COLUMN BALANCING** (CRITICAL):
   ${templateType === 'OLIVE_GREEN_MODERN' ? `
   **FOR OLIVE GREEN MODERN TEMPLATE:**
   - Two-column layout (.left-column and .right-column, each 50% width)
   - Left column typically has: Work Experience, Education
   - Right column typically has: Skills, Certifications, Languages
   - ANALYZE content length in both columns
   - If left is longer, move Education or some content to right column
   - If right is longer, move some content to left
   - Goal: Both columns approximately equal height
   - Move entire <section> elements between columns
   - Adjust .section margin-bottom to balance spacing
   ` : ''}${templateType === 'MODERN_PROFESSIONAL' ? `
   **FOR MODERN PROFESSIONAL TEMPLATE:**
   - Two-column layout (.left-column 40% width, .right-column 65% width)
   - Left column has: Profile pic, Name/Title, Contact, About Me, Skills
   - Right column has: Education, Experience (both use .timeline-container)
   - ANALYZE content length - if right column is much longer, you can move Skills to right column
   - If left column is too short, keep Skills in left but ensure right column content is balanced
   - Goal: Both columns should fill the page height appropriately
   - Adjust .section margin-bottom values to balance
   - Remove empty spaces below last sections
   ` : ''}${templateType === 'MINIMALIST_SIMPLE_PHOTO' ? `
   **FOR MINIMALIST SIMPLE PHOTO TEMPLATE:**
   - Two-column layout (.column-left flex: 1.5, .column-right flex: 1)
   - Left column (.column-left) has: WORK EXPERIENCE, REFERENCES
   - Right column (.column-right) has: ABOUT ME, EDUCATION, EXPERTISE (skills image), LANGUAGE
   - ANALYZE content length in both columns
   - If left column is longer, you can move some content (like Education) to left column
   - If right column is longer, move some content to left column
   - Goal: Both columns should fill page 1 completely before any content moves to page 2
   - CRITICAL: Fill page 1 completely - add more experience items, expand descriptions, add more skills/languages if needed
   - Adjust .section margin-bottom values (use 20-30px, reduce last section to 0-10px)
   - Remove empty spaces below last sections
   ` : ''}${templateType === 'COLORFUL_BLOCKS' ? `
   **FOR COLORFUL BLOCKS TEMPLATE:**
   - Two-column layout (.left-column 38% width, .right-column 62% width)
   - Left column has: Profile pic, Contact info, Skills, Certifications, Memberships
   - Right column has: Header (name/title/summary), Professional Summary, Education, Experience
   - ANALYZE content length in both columns
   - Left column is fixed with profile/contact/skills - ensure right column content fills appropriately
   - If right column is too short, expand experience descriptions, add more summary bullets, expand education details
   - Goal: Both columns should fill page 1 completely before any content moves to page 2
   - CRITICAL: Fill page 1 completely - expand descriptions, add more experience bullets, expand summary
   - Adjust .section margin-top values (use 20px) and spacing
   - Remove empty spaces below last sections
   ` : ''}${templateType === 'ELEGANT_PROFESSIONAL_PHOTO' ? `
   **FOR ELEGANT PROFESSIONAL PHOTO TEMPLATE:**
   - Two-column layout (.left-column 30% width, .right-column 70% width)
   - Left column has: Profile pic (.image-container), Contact, Expertise, Software Knowledge, Personal Skills
   - Right column has: Name/Subtitle, Personal Profile, Work Experience, Education
   - ANALYZE content length in both columns
   - Left column is mostly fixed with profile/contact/skills - ensure right column content fills appropriately
   - If right column is too short, expand experience descriptions, add more job bullets, expand personal profile, expand education details
   - Goal: Both columns should fill page 1 completely before any content moves to page 2
   - CRITICAL: Fill page 1 completely - expand job descriptions, add more experience bullets, expand personal profile paragraph
   - Adjust .right-section margin-bottom values (use 1.5em, reduce last section)
   - Remove empty spaces below last sections
   ` : ''}${templateType === 'BANDW_PROFESSIONAL' ? `
   **FOR B&W PROFESSIONAL TEMPLATE:**
   - Single-column layout with two-column structure for experience/education items
   - Header has: Profile pic, Name, Job Title, Contact info (phone, email, web)
   - Sections: About Me, Education, Experience, Skills, References
   - Experience/Education use .two-col-section: .left-col (dates/company, 160px width) and .right-col (title/description)
   - Skills use .skills-grid with 4 columns
   - References use .references-grid with 2 columns
   - ANALYZE content length - if there's empty space, expand descriptions, add more experience items, expand education details, add more skills
   - Goal: Fill page 1 completely before any content moves to page 2
   - CRITICAL: Fill page 1 completely - expand job descriptions, add more experience items if needed, expand about me paragraph, expand education descriptions
   - Adjust .section margin-bottom values (use 25px, reduce last section)
   - Remove empty spaces below last sections
   ` : ''}${templateType === 'BLUE_SIMPLE_PROFILE' ? `
   **FOR BLUE SIMPLE PROFILE TEMPLATE:**
   - Two-column layout (.left-column 250px width, .right-column 416px width)
   - Header has: .header-bg (blue #1237a9), .header-text (name/title, white text), .profile-pic (positioned absolutely)
   - Footer has: .footer-bg (blue #1237a9)
   - Left column has: Contact, Hard Skill, Soft Skill, Education Background
   - Right column has: About Me, Professional Experience, Achievements
   - ANALYZE content length in both columns
   - Left column is mostly fixed - ensure right column content fills appropriately
   - If right column is too short, expand experience descriptions, add more responsibility bullets, expand about me paragraph, expand achievements
   - Goal: Both columns should fill page 1 completely before any content moves to page 2
   - CRITICAL: Fill page 1 completely - expand job descriptions, add more responsibility bullets, expand about me paragraph, expand achievements
   - Adjust .section margin-bottom values (use 25px, reduce last section)
   - Remove empty spaces below last sections
   ` : ''}${templateType === '2_COLUMN_TIMELINE' ? `
   **FOR 2 COLUMN TIMELINE TEMPLATE:**
   - Two-column layout (.left-column 33% width with #3D3D78 background, .right-column 67% width)
   - Left column has: Profile pic, Contact, Education, Expertise (skills), Language
   - Right column has: Header (name/title/summary), Experience (using .timeline), Reference
   - Left column is fixed structure - ensure right column content fills appropriately
   - If right column is too short, expand experience descriptions, add more timeline items, expand summary
   - Goal: Both columns should fill page 1 completely before any content moves to page 2
   - CRITICAL: Fill page 1 completely - expand job descriptions in timeline items, add more experience items if needed
   - Adjust .right-section margin-bottom values (use 25px, reduce last section)
   - Remove empty spaces below last sections
   - CRITICAL: Preserve .timeline and .timeline-item structure with their ::before pseudo-elements
   ` : ''}${templateType === 'ACCENT_COLOR_MINIMAL' ? `
   **FOR ACCENT COLOR MINIMAL TEMPLATE:**
   - Single-column layout with two-column structure for experience/education items
   - Header has: Profile pic, Name/Title, Contact info (right-aligned)
   - Sections: Work Experience, Education, References/Expertise
   - Experience/Education use .section-content with .left-column (25%) and .right-column (75%)
   - Skills use .expertise-item with .expertise-bar (progress bars)
   - References use .reference-item
   - ANALYZE content length - if there's empty space, expand descriptions, add more experience items, expand education details
   - Goal: Fill page 1 completely before any content moves to page 2
   - CRITICAL: Fill page 1 completely - expand job descriptions, add more experience items if needed, expand education descriptions
   - Adjust .section margin-bottom values (use 15px, reduce last section)
   - Remove empty spaces below last sections
   ` : ''}

3. **FIX DATA POPULATION ISSUES** (TEMPLATE-SPECIFIC):
   ${templateType === 'OLIVE_GREEN_MODERN' ? `
   **OLIVE GREEN MODERN:**
   - Name → .header-left h1 (the large heading)
   - Role/Title → .header-left .title (the beige rounded box)
   - Contact → .footer .footer-item spans
   - Summary → .about-me p
   - Experience → .left-column .work-experience .job items
   - Education → .left-column .education .education-item
   - Skills → .right-column .skills ul li
   - Languages → .right-column .language ul li (format: "Language - Proficiency")
   ` : ''}${templateType === 'MODERN_PROFESSIONAL' ? `
   **MODERN PROFESSIONAL:**
   - Name → .name-title .name (h1 with Playfair Display font, color #d8be93)
   - Role/Title → .name-title .job-title (p tag, smaller font, color #636466)
   - Contact → .left-column .section .contact-item spans (phone, email, location)
   - Summary → .left-column .section .about-me-text (p tag, replace Lorem ipsum)
   - Skills → .left-column .section .skills-list li (each skill as separate <li>)
   - Education → .right-column .section .timeline-container .timeline-item
     * Structure: .item-title (degree), .item-subtitle (school), .item-date (dates), .item-description (details)
   - Experience → .right-column .section .timeline-container .timeline-item
     * Structure: .item-title (job title), .item-subtitle (company), .item-date (dates), .item-description (bullets/description)
   - Languages → Add as new .section in .left-column or .right-column with .skills-list format
   ` : ''}${templateType === 'MINIMALIST_SIMPLE_PHOTO' ? `
   **MINIMALIST SIMPLE PHOTO:**
   - Name → .header-left h1 (large heading, font-size: 36px, font-weight: 700)
   - Role/Title → .header-left h2 (smaller heading, font-size: 16px, has ::after underline)
   - Contact → .header-left .contact-info p spans (phone, email, location with SVG icons)
   - Summary → .column-right .section "ABOUT ME" .item-description (p tag)
   - Experience → .column-left .section "WORK EXPERIENCE" .work-item
     * Structure: .item-date (dates), .item-title (job title), .item-subtitle (company), .item-description (description)
   - Education → .column-right .section "EDUCATION" .education-item
     * Structure: .item-date (dates), .item-title (school), .item-subtitle (degree)
   - Skills → .column-right .section "EXPERTISE" (can keep image or replace with text list)
   - Languages → .column-right .section "LANGUAGE" .language-item (p tags, format: "Language Name - Proficiency")
   ` : ''}${templateType === '2_COLUMN_TIMELINE' ? `
   **2 COLUMN TIMELINE:**
   - Name → .right-header h1 (font-size: 34px, color: #3D3D78, font-weight: 700)
   - Role/Title → .right-header .subtitle (font-size: 15px, color: #323b4c, letter-spacing: 0.15em)
   - Summary → .right-header .summary (font-size: 10px, color: #77797e)
   - Contact → .left-column .left-section "Contact" p tags (with <strong> labels for Phone, Email, Address)
   - Experience → .right-column .right-section "Experience" .timeline .timeline-item
     * Structure: .date-company (dates + company + location), .job-title (job title, font-weight: 700), p (description)
     * CRITICAL: Must use .timeline and .timeline-item structure - do NOT change this
   - Education → .left-column .left-section "Education" .education-item
     * Structure: p (dates), .degree (degree name, font-weight: 700), p (school name)
   - Skills → .left-column .left-section "Expertise" .expertise-list li (bullet list)
   - Languages → .left-column .left-section "Language" p tags (one language per p tag)
   - References → .right-column .right-section "Reference" .references-container .reference-item
     * Structure: .ref-name (name, font-weight: 700), p (title/company), .ref-contact (phone/email with <strong> labels)
   ` : ''}${templateType === 'COLORFUL_BLOCKS' ? `
   **COLORFUL BLOCKS:**
   - Name → .right-column .header h1 (large heading, font-size: 40px, color: white, background: #A97C74)
   - Role/Title → .right-column .header .subtitle (p tag, font-size: 13px, color: #FDF6EC)
   - Summary → .right-column .header p (brief summary paragraph, color: white)
   - Contact → .left-column .contact-info .contact-item spans (phone, email, location with icon images)
   - Professional Summary → .right-column .section "PROFESSIONAL SUMMARY" .summary-list li (bullet list with asterisk markers)
   - Experience → .right-column .section "EXPERIENCE" .experience-item
     * Structure: .item-header with .title (job title + company) and .date-badge (dates), .experience-list li (bullets with asterisk markers)
   - Education → .right-column .section "EDUCATION" .education-item
     * Structure: .item-header with .title (degree) and .date-badge (year), .item-subheader (school and graduation date)
   - Skills → .left-column .section "SKILLS" .skills-list li (bullet list with asterisk markers)
   - Certifications → .left-column .section "CERTIFICATION" .certification-item
     * Structure: .item-header with .title and .date-badge, .item-subheader (organization)
   - Languages → Add to .left-column .section "LANGUAGE" or .right-column if space allows
   ` : ''}${templateType === 'ELEGANT_PROFESSIONAL_PHOTO' ? `
   **ELEGANT PROFESSIONAL PHOTO:**
   - Name → .right-column h1 (large heading, font-size: 1.2em, color: #DC9589, letter-spacing: 0.2em)
   - Role/Title → .right-column .subtitle (p tag, font-size: 1em, color: #555)
   - Summary → .right-column .right-section "PERSONAL PROFILE" p (paragraph, expand to 3-5 sentences)
   - Contact → .left-column .left-section "CONTACT" .contact-item (with icon images and p tags)
   - Experience → .right-column .right-section "WORK EXPERIENCE" .job-title, .job-details, .job-description
     * Structure: .job-title (job title), .job-details (company | dates in Playfair Display italic), .job-description li (bullets with dash markers)
   - Education → .right-column .right-section "EDUCATION" .education-item
     * Structure: .degree (degree name), .institution (school | dates in Playfair Display italic)
   - Skills → .left-column .left-section "EXPERTISE" ul li (list items)
   - Software Knowledge → .left-column .left-section "SOFTWARE KNOWLEDGE" ul li (list items)
   - Personal Skills → .left-column .left-section "PERSONAL SKILLS" ul li (list items)
   - Languages → Add to .left-column .left-section "LANGUAGES" ul li if space allows
   ` : ''}${templateType === 'BANDW_PROFESSIONAL' ? `
   **B&W PROFESSIONAL:**
   - Name → .header-info h1 (large heading, Montserrat font, font-size: 30px, color: #171e1c)
   - Role/Title → .header-info .job-title (p tag, font-size: 16px, color: #171e1c)
   - Contact → .header-info .contact-info .contact-item (with classes .contact-phone, .contact-email, .contact-web)
   - Summary → .section "ABOUT ME" p (paragraph, expand to 3-5 sentences)
   - Experience → .section "EXPERIENCE" .two-col-section
     * Structure: .left-col .date (dates, bold), .left-col p (company), .right-col h3 (job title, Playfair Display, bold), .right-col p (description - expand with more detail)
   - Education → .section "EDUCATION" .two-col-section
     * Structure: .left-col .date (dates, bold), .left-col p (school), .right-col h3 (degree, Playfair Display, bold), .right-col p (description - expand with more detail)
   - Skills → .section "SKILLS" .skills-grid ul li (4-column grid, bullets with • marker)
   - References → .section "REFERENCES" .references-grid .reference-item (2-column grid)
   - Languages → Add to .section "LANGUAGES" or combine with Skills if space allows
   ` : ''}${templateType === 'BLUE_SIMPLE_PROFILE' ? `
   **BLUE SIMPLE PROFILE:**
   - Name → .header-text h1 (large heading, Inter font, font-size: 37px, color: white, positioned absolutely)
   - Role/Title → .header-text p (p tag, font-size: 18px, color: white)
   - Contact → .left-column .section "My Contact" .contact-item (with icon i tags and span)
   - Summary → .right-column .section "About Me" .about-me-text (p tag, expand to 3-5 sentences)
   - Experience → .right-column .section "Professional Experience" .experience-item
     * Structure: h3 (job title + company), .date (dates, italic), .responsibilities-title, .responsibilities-list li (bullets with • marker, expand descriptions)
   - Education → .left-column .section "Education Background" .education-list .education-item
     * Structure: .school (school name, bold), .degree (degree name), .completed (completion date)
   - Hard Skills → .left-column .section "Hard Skill" .skills-list li (bullets with • marker, color: #1237a9)
   - Soft Skills → .left-column .section "Soft Skill" .skills-list li (bullets with • marker, color: #1237a9)
   - Achievements → .right-column .section "Achievements" .achievements-container .achievement-item
     * Structure: .date (dates, bold, 80px width), .description (achievement description)
   - Languages → Add to .left-column .section "Languages" or combine with Skills if space allows
   ` : ''}${templateType === 'ACCENT_COLOR_MINIMAL' ? `
   **ACCENT COLOR MINIMAL:**
   - Name → .header-title h1 (large heading, font-size: 34.6px, color: #57b5b2)
   - Role/Title → .header-title p (p tag, font-size: 14px, color: #282522)
   - Contact → .header .contact-info div (right-aligned, with icon images)
   - Experience → .section "Work Experience" .section-content
     * Structure: .left-column .item .item-title (job title, normal weight) and .item-date (dates, bold), .right-column .item .item-title (company + location) and .item-description (description - expand with more detail, can include ul li bullets)
   - Education → .section "Education" .section-content
     * Structure: .left-column .item .item-title (degree, normal weight) and .item-date (dates, bold), .right-column .item .item-title (school + location) and .item-description (description - expand with more detail)
   - Skills → .section "Expertise" .expertise-item
     * Structure: .expertise-label (skill name), .expertise-bar with .expertise-level (progress bar, color: #57b5b2)
   - References → .section "References" .reference-item
     * Structure: .reference-name (name, bold), .reference-details (title, phone, email)
   - Languages → Add to .section "Languages" or combine with Skills if space allows
   ` : ''}
   
   **COMMON RULES:**
   - Format languages: "Language Name - Proficiency Level" (one per line)
   - Do NOT duplicate language entries
   - Remove ALL placeholder text
   - Do NOT put role in name field or name in role field

4. **FIX FORMATTING ISSUES**:
   - Remove ALL empty spaces and gaps between sections
   - Fix irregular spacing (make it consistent)
   - Remove spacing below the last section in each column
   - Set .section:last-child { margin-bottom: 0 } or reduce significantly
   - Ensure proper alignment of all elements
   - Fix text overflow or clipping issues
   - Remove duplicate content
   - Fix broken layouts

5. **FIX CSS ISSUES** (TEMPLATE-SPECIFIC):
   ${templateType === 'OLIVE_GREEN_MODERN' ? `
   **OLIVE GREEN MODERN:**
   - .page has min-height: 1123px - keep this
   - .footer has position: absolute - convert to position: relative if it creates empty space
   - Ensure .main-content flex layout works
   - .left-column and .right-column should have equal heights
   - Add CSS if needed: .left-column, .right-column { display: flex; flex-direction: column; }
   
   **MODERN PROFESSIONAL:**
   - .page has min-height: 1123px - keep this
   - .left-column has background-color: #F7F7F7 - preserve this
   - .right-column has background-color: #ffffff - preserve this
   - .background-shape should remain in .left-column
   - .timeline-container and .timeline-line should work correctly
   - Ensure timeline items are properly spaced
   - Remove empty spaces by adjusting .section margin-bottom
   ` : ''}${templateType === 'MINIMALIST_SIMPLE_PHOTO' ? `
   **MINIMALIST SIMPLE PHOTO:**
   - .page has min-height: 1123px - keep this
   - .header has height: 250px, background-color: #F6F6F6 - preserve this EXACTLY
   - .header-left has padding: 40px 50px - preserve this EXACTLY
   - .header-right img has height: 250px - preserve this EXACTLY
   - .main-content has padding: 30px 50px, gap: 40px - preserve this EXACTLY
   - .column-left has flex: 1.5, .column-right has flex: 1 - preserve this EXACTLY
   - .section-title has ::after underline (width: 40px, height: 3px, background-color: #3b8586) - preserve this EXACTLY
   - .contact-info svg styling (width: 14px, height: 14px, fill: #425867) - preserve this EXACTLY
   - .header-left h1 (font-size: 36px, font-weight: 700) - preserve this EXACTLY
   - .header-left h2 (font-size: 16px, font-weight: 700) with ::after underline - preserve this EXACTLY
   - Remove empty spaces by adjusting .section margin-bottom (use 20-30px, last section: 0-10px)
   - CRITICAL: Ensure content fills page 1 completely - if there's empty space, expand descriptions, add more items, or adjust spacing
   - CRITICAL: DO NOT modify any CSS colors, fonts, or layout properties - only modify content text
   ` : ''}${templateType === '2_COLUMN_TIMELINE' ? `
   **2 COLUMN TIMELINE:**
   - CRITICAL: Preserve the ENTIRE <style> block exactly as provided - DO NOT modify, remove, or add any CSS rules
   - body: background-color: #f0f0f0, font-family: 'Open Sans', min-width: 816px - preserve EXACTLY
   - .page: width: 816px, min-height: 1056px, background-color: #ffffff, display: flex, box-shadow - preserve EXACTLY
   - .left-column: width: 33%, background-color: #3D3D78, color: #ffffff, padding: 40px 30px, box-sizing: border-box - preserve EXACTLY
   - .right-column: width: 67%, border-top: 10px solid #3D3D78, border-bottom: 10px solid #3D3D78, border-right: 10px solid #3D3D78 - preserve EXACTLY
   - .profile-pic: width: 124px, height: 124px, border-radius: 50% - preserve EXACTLY
   - .left-section: position: relative, margin-bottom: 25px - preserve EXACTLY
   - .left-section .divider: position: absolute, width: calc(100% + 30px), left: 0, height: 1px, background: #fff, top: 32px - preserve EXACTLY
   - .left-section h2: font-family: 'Open Sans', font-weight: 700, font-size: 17px, text-transform: uppercase - preserve EXACTLY
   - .left-section p, .left-section li: font-size: 10px, line-height: 1.6 - preserve EXACTLY
   - .right-header h1: font-family: 'Open Sans', font-size: 34px, color: #3D3D78, font-weight: 700 - preserve EXACTLY
   - .right-header .subtitle: font-family: 'Open Sans', font-size: 15px, color: #323b4c, letter-spacing: 0.15em, font-weight: 600 - preserve EXACTLY
   - .right-header .summary: font-size: 10px, color: #77797e, line-height: 1.6 - preserve EXACTLY
   - .right-section h2: font-family: 'Calibri', font-size: 20px, color: #323b4c, border-bottom: 2px solid #dcdcdc, font-weight: bold - preserve EXACTLY
   - .timeline: position: relative, padding-left: 25px - preserve EXACTLY
   - .timeline::before: content: '', position: absolute, left: 7px, top: 8px, bottom: 8px, width: 1px, background-color: #323b4c - preserve EXACTLY
   - .timeline-item: position: relative, margin-bottom: 40px - preserve EXACTLY
   - .timeline-item::before: content: '', position: absolute, left: -25px, top: 5px, width: 10px, height: 10px, border-radius: 50%, background-color: #ffffff, border: 2px solid #323b4c, z-index: 1 - preserve EXACTLY
   - .timeline-item p: font-size: 10px, line-height: 1.6, color: #6b6767 - preserve EXACTLY
   - .timeline-item .date-company: font-size: 11px, color: #6b6767 - preserve EXACTLY
   - .timeline-item .job-title: font-weight: 700, font-size: 12px, color: #323b4c - preserve EXACTLY
   - .references-container: display: flex, justify-content: space-between - preserve EXACTLY
   - .reference-item: width: 48% - preserve EXACTLY
   - CRITICAL: Preserve ALL @import statements for fonts ('Open Sans' and 'Calibri')
   - CRITICAL: DO NOT modify, delete, or rewrite any CSS - keep the entire style block intact
   - CRITICAL: Only modify HTML content (text inside tags), never CSS properties
   ` : ''}${templateType === 'COLORFUL_BLOCKS' ? `
   **COLORFUL BLOCKS:**
   - .page has min-height: 1123px - keep this
   - .header has background-color: #A97C74, color: white, padding: 40px 45px - preserve this
   - .left-column has width: 38%, background-color: #FDF6EC for .profile-pic-container and .contact-info - preserve this
   - .right-column has width: 62%, background-color: #FFFFFF - preserve this
   - .date-badge has background-color: #A97C74, color: white, border-radius: 10px - preserve this
   - .footer-bar has height: 40px, background-color: #A97C74 - preserve this
   - .section-title has border-bottom: 1px solid #333 - preserve this
   - .skills-list li, .summary-list li, .experience-list li use asterisk (*) as bullet marker - preserve this
   - Remove empty spaces by adjusting .section margin-top (use 20px)
   - CRITICAL: Ensure content fills page 1 completely - expand experience descriptions, add more summary bullets, expand education details
   
   **ELEGANT PROFESSIONAL PHOTO:**
   - .page has min-height: 11in (8.5in width) - keep this
   - .left-column has width: 30%, padding: 3em 2em - preserve this
   - .right-column has width: 70%, padding: 3em 3em 3em 2.5em - preserve this
   - .image-container has background-color: #F7E6E5, padding: 1em 1em 2em - preserve this
   - .divider has width: 1px, background-color: #e0e0e0, positioned absolutely - preserve this
   - .signature has font-family: 'Dancing Script', color: #d1a3a4, positioned absolutely - preserve this decorative element
   - .right-column h1 has color: #DC9589, letter-spacing: 0.2em - preserve this
   - .right-section h2 has color: #DC9589, border-bottom: 1px solid #e0e0e0 - preserve this
   - .job-details uses Playfair Display italic font - preserve this
   - .job-description li uses dash (-) as bullet marker - preserve this
   - .education-item .institution uses Playfair Display italic font - preserve this
   - Remove empty spaces by adjusting .right-section margin-bottom (use 1.5em, reduce last section)
   - CRITICAL: Ensure content fills page 1 completely - expand job descriptions, add more experience bullets, expand personal profile paragraph
   ` : ''}${templateType === 'BANDW_PROFESSIONAL' ? `
   **B&W PROFESSIONAL:**
   - .page has min-height: 1123px, width: 794px, padding: 20px 70px 60px 70px - preserve this
   - .header has display: flex, align-items: flex-end - preserve this
   - .profile-pic has width: 154px, height: 153px - preserve this
   - .header-info h1 has font-family: Montserrat, font-size: 30px, color: #171e1c - preserve this
   - .header-info .job-title has font-size: 16px, color: #171e1c - preserve this
   - .contact-info has border-top and border-bottom: 1px solid #000 - preserve this
   - .contact-item uses ::before pseudo-element for icons (phone, email, web) - preserve this
   - .section-title has font-family: Montserrat, border-bottom: 1px solid #000 - preserve this
   - .two-col-section has .left-col (160px width) and .right-col (flex-grow: 1) - preserve this
   - .left-col .date has font-weight: 800 - preserve this
   - .right-col h3 has font-family: Playfair Display, font-size: 16px, font-weight: bold - preserve this
   - .skills-grid has grid-template-columns: repeat(4, 1fr) - preserve this 4-column layout
   - .skills-grid li uses • as bullet marker - preserve this
   - .references-grid has grid-template-columns: 1fr 1fr - preserve this 2-column layout
   - Remove empty spaces by adjusting .section margin-bottom (use 25px, reduce last section)
   - CRITICAL: Ensure content fills page 1 completely - expand job descriptions, add more experience items if needed, expand about me paragraph, expand education descriptions
   ` : ''}${templateType === 'BLUE_SIMPLE_PROFILE' ? `
   **BLUE SIMPLE PROFILE:**
   - .page has width: 816px, min-height: 1056px - preserve this
   - .header-bg has background-color: #1237a9, height: 180px, positioned absolutely - preserve this
   - .footer-bg has background-color: #1237a9, height: 20px, positioned absolutely - preserve this
   - .header-text has position: absolute, color: white - preserve this
   - .header-text h1 has font-family: Inter, font-size: 37px, font-weight: 800 - preserve this
   - .profile-pic has width: 160px, height: 160px, border-radius: 50%, positioned absolutely - preserve this
   - .main-content has transform: translateY(70px) translateX(30px) - preserve this
   - .left-column has width: 250px - preserve this
   - .right-column has width: 416px, transform: translateY(-40px) translateX(30px) - preserve this
   - .section-title has color: #1237a9, border-bottom: 2px solid #1237a9 - preserve this
   - .skills-list li uses • as bullet marker, color: #1237a9 - preserve this
   - .education-item uses ::before pseudo-element (8px circle, color: #1237a9) - preserve this
   - .experience-item ul li uses • as bullet marker, color: #1237a9 - preserve this
   - Remove empty spaces by adjusting .section margin-bottom (use 25px, reduce last section)
   - CRITICAL: Ensure content fills page 1 completely - expand job descriptions, add more responsibility bullets, expand about me paragraph, expand achievements
   ` : ''}${templateType === 'ACCENT_COLOR_MINIMAL' ? `
   **ACCENT COLOR MINIMAL:**
   - .page has width: 794px, min-height: 1123px, padding: 40px 40px - preserve this
   - .header has display: flex, align-items: center - preserve this
   - .profile-pic has width: 150px, height: 150px, border-radius: 50% - preserve this
   - .header-title h1 has font-size: 34.6px, color: #57b5b2, font-weight: bold - preserve this
   - .header-title p has font-size: 14px, color: #282522 - preserve this
   - .contact-info has text-align: right - preserve this
   - .section-title has ::after pseudo-element with dashed line - preserve this
   - .section-content has .left-column (25%) and .right-column (75%) - preserve this
   - .left-column .item-date has font-weight: bold - preserve this
   - .right-column .item-title has font-weight: bold - preserve this
   - .expertise-bar has background-color: #e0e0e0, .expertise-level has background-color: #57b5b2 - preserve this
   - Remove empty spaces by adjusting .section margin-bottom (use 15px, reduce last section)
   - CRITICAL: Ensure content fills page 1 completely - expand job descriptions, add more experience items if needed, expand education descriptions
   ` : ''}

6. **POPULATE DATA INTELLIGENTLY**:
   - Replace ALL placeholder text with real data
   - Map data to correct template locations based on template type
   - Ensure name, contact, summary, experience, education, skills are all populated
   - Do NOT leave "Unknown" or placeholder names
   - Do NOT put role/title in the name field

7. **PAGE 1 FILLING (CRITICAL FOR ALL TEMPLATES)**:
   - ALWAYS fill page 1 completely before any content moves to page 2
   - If there's empty space on page 1:
     * Expand job descriptions with more detail
     * Add more bullet points to experience items
     * Expand the summary/about me section
     * Add more skills or languages if available
     * Increase spacing between sections slightly
     * Add more education details if available
   - Only move content to page 2 if page 1 is completely full
   - Goal: Page 1 should be fully utilized with no empty space at the bottom

8. **MAINTAIN TEMPLATE STRUCTURE**:
   - Keep the same HTML structure and class names
   - Preserve the template's layout (single-column, two-column, etc.)
   - Keep all decorative elements and styling intact
   - Only modify content and spacing, not the visual design

8. **CRITICAL OUTPUT FORMAT - ABSOLUTE REQUIREMENT**:
   - **YOU MUST RETURN THE COMPLETE HTML DOCUMENT - NOTHING ELSE**
   - Your FIRST character must be < (opening of <!DOCTYPE html> or <style>)
   - Return the ENTIRE HTML document: <style>...</style><body>...</body> or <!DOCTYPE html><html>...</html>
   - Do NOT generate partial CSS fragments or individual properties
   - Do NOT include markdown code blocks
   - Do NOT include any explanations, comments, or text before/after the HTML
   - The response must be the COMPLETE, FINAL HTML - ready to use
   - If you include any text outside HTML tags, your response is WRONG
   ${templateType === '2_COLUMN_TIMELINE' ? `
   - **FOR 2 COLUMN TIMELINE**: Copy the <style> block EXACTLY as provided - character-for-character. Only modify text content inside HTML tags.` : ''}

${options?.fitToOnePage ? `
9. **ONE PAGE CONSTRAINT**:
   - MUST fit on a single A4 page
   - Use compact spacing
   - Limit to most recent 3-4 roles
   - Limit bullets to 2-3 per role
   - Condense summary to 2-3 lines
` : ''}

Your output should be the template HTML with:
- All data populated correctly (name in name field, role in role field)
- Columns balanced dynamically (equal height)
- All formatting issues fixed
- All spacing issues resolved (no empty spaces)
- Language section properly formatted
- Original styling preserved`;

  const userPrompt = `TEMPLATE HTML TO FIX AND POPULATE:
${templateHtml}

RESUME DATA TO POPULATE:

PERSONAL INFORMATION:
- Name: ${name}
- Location: ${location}
- Email: ${email}
- Phone: ${phone}
- LinkedIn: ${linkedin}
- GitHub: ${github}
- Website: ${website}

PROFESSIONAL SUMMARY:
${summary}

WORK EXPERIENCE:
${experiences.map(exp => `
- Title: ${exp.title}
- Company: ${exp.organization || ''}
- Dates: ${exp.dates || `${exp.startDate || ''} - ${exp.endDate || (exp.current ? 'Present' : '')}`}
- Description: ${exp.description || ''}
`).join('\n')}

EDUCATION:
${education.map(edu => `
- Degree: ${edu.title}
- School: ${edu.organization || ''}
- Dates: ${edu.dates || `${edu.startDate || ''} - ${edu.endDate || ''}`}
- Description: ${edu.description || ''}
`).join('\n')}

SKILLS:
${skills.map(skill => `- ${skill.title}`).join('\n')}

${projects.length > 0 ? `PROJECTS:\n${projects.map(proj => `
- Name: ${proj.title}
- Description: ${proj.description || ''}
- Organization: ${proj.organization || ''}
`).join('\n')}` : ''}

${certifications.length > 0 ? `CERTIFICATIONS:\n${certifications.map(cert => `
- Name: ${cert.title}
- Organization: ${cert.organization || ''}
- Date: ${cert.dates || cert.startDate || ''}
`).join('\n')}` : ''}

LANGUAGES:
${languages.length > 0 ? languages.map(lang => {
  const proficiency = lang.organization || lang.description || 'Proficient';
  return `- ${lang.title} - ${proficiency}`;
}).join('\n') : '- No languages specified'}

TARGET ROLE: ${intent.targetRole}
TARGET LOCATION: ${intent.targetLocation}
${intent.jobSearchIntent ? `JOB DESCRIPTION:\n${intent.jobSearchIntent}` : ''}

TEMPLATE-SPECIFIC INSTRUCTIONS:

**If this is OLIVE GREEN MODERN template** (has .header-left, .arrow-icon-wrapper):
- Name goes in .header-left h1
- Role goes in .header-left .title (beige box)
- Contact info goes in .footer .footer-item spans
- Experience items use .job structure with .details and ul li bullets
- Education uses .education-item structure
- Balance .left-column and .right-column heights

**If this is MODERN PROFESSIONAL template** (has .name-title, .timeline-container):
- Name goes in .name-title .name (h1, Playfair Display, #d8be93 color)
- Role goes in .name-title .job-title (p tag)
- Contact info goes in .left-column .section .contact-item
- Experience uses .timeline-item structure:
  * .item-title = job title
  * .item-subtitle = company name
  * .item-date = dates
  * .item-description = job description/bullets
- Education uses same .timeline-item structure:
  * .item-title = degree
  * .item-subtitle = school name
  * .item-date = dates
  * .item-description = details
- Skills go in .left-column .section .skills-list li
- Balance .left-column (40%) and .right-column (65%) content

**If this is MINIMALIST SIMPLE PHOTO template** (has .header-left h1/h2, .column-left/.column-right):
- Name goes in .header-left h1 (large heading, font-size: 36px, font-weight: 700)
- Role goes in .header-left h2 (smaller heading with ::after underline, font-size: 16px)
- Contact info goes in .header-left .contact-info p (with SVG icons, preserve SVG styling)
- Summary goes in .column-right .section "ABOUT ME" .item-description
- Experience goes in .column-left .section "WORK EXPERIENCE" .work-item:
  * .item-date = dates
  * .item-title = job title
  * .item-subtitle = company
  * .item-description = description
- Education goes in .column-right .section "EDUCATION" .education-item:
  * .item-date = dates
  * .item-title = school
  * .item-subtitle = degree
- Skills can go in .column-right .section "EXPERTISE" (replace image with text or keep image)
- Languages go in .column-right .section "LANGUAGE" .language-item (p tags)
- CRITICAL: Fill page 1 completely - expand descriptions, add more items if needed, adjust spacing
- Balance .column-left (flex: 1.5) and .column-right (flex: 1) content
- CRITICAL: Preserve ALL CSS - header background-color: #F6F6F6, header height: 250px, column flex values, section-title ::after underline

**If this is 2 COLUMN TIMELINE template** (has .left-column with #3D3D78 background, .timeline, .timeline-item):
- **ABSOLUTELY CRITICAL**: DO NOT modify the <style> block AT ALL. Keep it EXACTLY as provided in the template HTML.
- **ABSOLUTELY CRITICAL**: Preserve ALL CSS properties including: @import statements, body styles, .page styles, .left-column background-color #3D3D78, .right-column borders, .timeline and .timeline-item ::before pseudo-elements, ALL font families, sizes, colors, and spacing.
- Name goes in .right-header h1 (DO NOT change the CSS for this element - only the text content)
- Role goes in .right-header .subtitle (DO NOT change the CSS for this element - only the text content)
- Summary goes in .right-header .summary (DO NOT change the CSS for this element - only the text content)
- Contact goes in .left-column .left-section "Contact" p tags (with <strong> labels) - preserve all styling
- Experience goes in .right-column .right-section "Experience" .timeline .timeline-item:
  * .date-company = dates + company + location (preserve font-size: 11px, color: #6b6767)
  * .job-title = job title (preserve font-weight: 700, font-size: 12px, color: #323b4c)
  * p = description (preserve font-size: 10px, color: #6b6767)
  * CRITICAL: Must use .timeline and .timeline-item structure - preserve timeline styling with ::before pseudo-elements
  * CRITICAL: The .timeline::before creates the vertical line - DO NOT modify this CSS
  * CRITICAL: The .timeline-item::before creates the circles - DO NOT modify this CSS
- Education goes in .left-column .left-section "Education" .education-item:
  * p = dates (preserve font-size: 10px)
  * .degree = degree name (preserve font-weight: 700, font-size: 11px)
  * p = school name (preserve font-size: 10px)
- Skills go in .left-column .left-section "Expertise" .expertise-list li (preserve list-style-type: disc, padding-left: 10px)
- Languages go in .left-column .left-section "Language" p tags (preserve font-size: 10px, one per p tag)
- References go in .right-column .right-section "Reference" .references-container .reference-item (preserve display: flex, width: 48%)
- CRITICAL: The entire <style> block from the template must remain UNCHANGED - copy it exactly as provided
- CRITICAL: Only modify text content inside HTML tags, NEVER modify CSS properties, values, or the style block structure

**If this is COLORFUL BLOCKS template** (has .header with #A97C74 background, .date-badge, .footer-bar):
- Name goes in .right-column .header h1 (large heading, white text on brown background)
- Role goes in .right-column .header .subtitle (p tag, color: #FDF6EC)
- Summary goes in .right-column .header p (brief paragraph, white text)
- Contact info goes in .left-column .contact-info .contact-item (with icon images)
- Professional Summary goes in .right-column .section "PROFESSIONAL SUMMARY" .summary-list li (bullets with asterisk)
- Experience goes in .right-column .section "EXPERIENCE" .experience-item:
  * .item-header .title = job title + company
  * .item-header .date-badge = dates (brown badge)
  * .experience-list li = bullet points with asterisk markers
- Education goes in .right-column .section "EDUCATION" .education-item:
  * .item-header .title = degree
  * .item-header .date-badge = year
  * .item-subheader = school and graduation date
- Skills go in .left-column .section "SKILLS" .skills-list li (bullets with asterisk)
- Certifications go in .left-column .section "CERTIFICATION" .certification-item:
  * .item-header .title = certification name
  * .item-header .date-badge = date
  * .item-subheader = organization
- CRITICAL: Fill page 1 completely - expand experience descriptions, add more summary bullets, expand education details
- Balance .left-column (38%) and .right-column (62%) content

**If this is ELEGANT PROFESSIONAL PHOTO template** (has .image-container with #F7E6E5, .signature, .right-section):
- Name goes in .right-column h1 (large heading, color: #DC9589, letter-spacing: 0.2em)
- Role goes in .right-column .subtitle (p tag, color: #555)
- Summary goes in .right-column .right-section "PERSONAL PROFILE" p (expand to 3-5 sentences)
- Contact info goes in .left-column .left-section "CONTACT" .contact-item (with icon images and p tags)
- Experience goes in .right-column .right-section "WORK EXPERIENCE":
  * .job-title = job title (h4, bold)
  * .job-details = company | dates (Playfair Display italic)
  * .job-description li = bullet points with dash markers (expand descriptions)
- Education goes in .right-column .right-section "EDUCATION" .education-item:
  * .degree = degree name
  * .institution = school | dates (Playfair Display italic)
- Skills go in .left-column .left-section "EXPERTISE" ul li
- Software Knowledge goes in .left-column .left-section "SOFTWARE KNOWLEDGE" ul li
- Personal Skills goes in .left-column .left-section "PERSONAL SKILLS" ul li
- Languages can go in .left-column .left-section "LANGUAGES" ul li if space allows
- CRITICAL: Fill page 1 completely - expand job descriptions, add more experience bullets, expand personal profile paragraph
- Balance .left-column (30%) and .right-column (70%) content

**If this is B&W PROFESSIONAL template** (has .header with .profile-pic/.header-info, .two-col-section, .skills-grid):
- Name goes in .header-info h1 (large heading, Montserrat font, color: #171e1c)
- Role goes in .header-info .job-title (p tag, color: #171e1c)
- Contact info goes in .header-info .contact-info .contact-item (with classes .contact-phone, .contact-email, .contact-web)
- Summary goes in .section "ABOUT ME" p (expand to 3-5 sentences)
- Experience goes in .section "EXPERIENCE" .two-col-section:
  * .left-col .date = dates (bold)
  * .left-col p = company
  * .right-col h3 = job title (Playfair Display, bold)
  * .right-col p = description (expand with more detail)
- Education goes in .section "EDUCATION" .two-col-section:
  * .left-col .date = dates (bold)
  * .left-col p = school
  * .right-col h3 = degree (Playfair Display, bold)
  * .right-col p = description (expand with more detail)
- Skills go in .section "SKILLS" .skills-grid ul li (4-column grid, bullets with •)
- References go in .section "REFERENCES" .references-grid .reference-item (2-column grid)
- Languages can go in .section "LANGUAGES" or combine with Skills if space allows
- CRITICAL: Fill page 1 completely - expand job descriptions, add more experience items if needed, expand about me paragraph, expand education descriptions
- Single-column layout - ensure all sections fill page 1 appropriately

**If this is BLUE SIMPLE PROFILE template** (has .header-bg/.footer-bg with #1237a9, .header-text, .profile-pic):
- Name goes in .header-text h1 (large heading, Inter font, white text, positioned absolutely)
- Role goes in .header-text p (p tag, white text)
- Contact info goes in .left-column .section "My Contact" .contact-item (with icon i tags and span)
- Summary goes in .right-column .section "About Me" .about-me-text (expand to 3-5 sentences)
- Experience goes in .right-column .section "Professional Experience" .experience-item:
  * h3 = job title + company
  * .date = dates (italic)
  * .responsibilities-title = "Key responsibilities:"
  * .responsibilities-list li = bullet points with • markers (expand descriptions, add more bullets)
- Education goes in .left-column .section "Education Background" .education-list .education-item:
  * .school = school name (bold)
  * .degree = degree name
  * .completed = completion date
- Hard Skills go in .left-column .section "Hard Skill" .skills-list li (bullets with •, color: #1237a9)
- Soft Skills go in .left-column .section "Soft Skill" .skills-list li (bullets with •, color: #1237a9)
- Achievements go in .right-column .section "Achievements" .achievements-container .achievement-item:
  * .date = dates (bold, 80px width)
  * .description = achievement description
- Languages can go in .left-column .section "Languages" or combine with Skills if space allows
- CRITICAL: Fill page 1 completely - expand job descriptions, add more responsibility bullets, expand about me paragraph, expand achievements
- Balance .left-column (250px) and .right-column (416px) content

**If this is ACCENT COLOR MINIMAL template** (has .header with .profile-pic/.header-title/.contact-info, .section-content):
- Name goes in .header-title h1 (large heading, color: #57b5b2)
- Role goes in .header-title p (p tag, color: #282522)
- Contact info goes in .header .contact-info div (right-aligned, with icon images)
- Experience goes in .section "Work Experience" .section-content:
  * .left-column .item .item-title = job title (normal weight)
  * .left-column .item .item-date = dates (bold)
  * .right-column .item .item-title = company + location (bold)
  * .right-column .item .item-description = description (expand with more detail, can include ul li bullets)
- Education goes in .section "Education" .section-content:
  * .left-column .item .item-title = degree (normal weight)
  * .left-column .item .item-date = dates (bold)
  * .right-column .item .item-title = school + location (bold)
  * .right-column .item .item-description = description (expand with more detail)
- Skills go in .section "Expertise" .expertise-item:
  * .expertise-label = skill name
  * .expertise-bar with .expertise-level = progress bar (color: #57b5b2, use level-1/level-2/level-3 classes)
- References go in .section "References" .reference-item:
  * .reference-name = name (bold)
  * .reference-details = title, phone, email
- Languages can go in .section "Languages" or combine with Skills if space allows
- CRITICAL: Fill page 1 completely - expand job descriptions, add more experience items if needed, expand education descriptions
- Single-column layout with two-column structure for items - ensure all sections fill page 1 appropriately

Fix the template HTML by:

1. **Detect template type first**:
   - Check if it's OLIVE GREEN MODERN (.header-left, .arrow-icon-wrapper), MODERN PROFESSIONAL (.name-title, .timeline-container), MINIMALIST SIMPLE PHOTO (.header-left h1/h2, .column-left/.column-right), 2 COLUMN TIMELINE (.left-column with #3D3D78 background, .timeline with ::before, .timeline-item with ::before circle), COLORFUL BLOCKS (.header with #A97C74, .date-badge, .footer-bar), ELEGANT PROFESSIONAL PHOTO (.image-container with #F7E6E5, .signature, .right-section), B&W PROFESSIONAL (.header with .profile-pic/.header-info, .two-col-section, .skills-grid), BLUE SIMPLE PROFILE (.header-bg/.footer-bg with #1237a9, .header-text), or ACCENT COLOR MINIMAL (.header with .profile-pic/.header-title, .section-content, .expertise-item)
   - Apply template-specific fixes based on the detected type
   - CRITICAL: For MINIMALIST SIMPLE PHOTO and 2 COLUMN TIMELINE, preserve ALL CSS exactly as provided - do NOT modify colors, fonts, sizes, or layout properties

2. **Populate data correctly** (template-specific):
   
   **If OLIVE GREEN MODERN:**
   - Name → .header-left h1 (large heading)
   - Role → .header-left .title (beige rounded box)
   - Contact → .footer .footer-item spans
   - Summary → .about-me p
   - Experience → .left-column .work-experience .job
   - Education → .left-column .education .education-item
   - Skills → .right-column .skills ul li
   - Languages → .right-column .language ul li
   
   **If MODERN PROFESSIONAL:**
   - Name → .name-title .name (h1, Playfair Display, color #d8be93)
   - Role → .name-title .job-title (p tag, smaller font)
   - Contact → .left-column .section .contact-item spans
   - Summary → .left-column .section .about-me-text (p tag)
   - Skills → .left-column .section .skills-list li
   - Education → .right-column .section .timeline-container .timeline-item
   - Experience → .right-column .section .timeline-container .timeline-item
   - Languages → Add to appropriate section (left or right column)
   
   **If MINIMALIST SIMPLE PHOTO:**
   - Name → .header-left h1 (large heading, font-size: 36px)
   - Role → .header-left h2 (smaller heading with underline)
   - Contact → .header-left .contact-info p (with SVG icons)
   - Summary → .column-right .section "ABOUT ME" .item-description (expand to 3-5 sentences)
   - Experience → .column-left .section "WORK EXPERIENCE" .work-item
     * .item-date = dates
     * .item-title = job title
     * .item-subtitle = company
     * .item-description = description (expand with more detail)
   - Education → .column-right .section "EDUCATION" .education-item
     * .item-date = dates
     * .item-title = school
     * .item-subtitle = degree
   - Skills → .column-right .section "EXPERTISE" (can replace image with text list or keep image)
   - Languages → .column-right .section "LANGUAGE" .language-item (p tags, format: "Language - Proficiency")
   
   **If COLORFUL BLOCKS:**
   - Name → .right-column .header h1 (large heading, white text, background: #A97C74)
   - Role → .right-column .header .subtitle (p tag, color: #FDF6EC)
   - Summary → .right-column .header p (brief paragraph, white text)
   - Contact → .left-column .contact-info .contact-item (with icon images)
   - Professional Summary → .right-column .section "PROFESSIONAL SUMMARY" .summary-list li (bullets with asterisk)
   - Experience → .right-column .section "EXPERIENCE" .experience-item
     * .item-header .title = job title + company
     * .item-header .date-badge = dates (brown badge with white text)
     * .experience-list li = bullet points with asterisk markers (expand descriptions)
   - Education → .right-column .section "EDUCATION" .education-item
     * .item-header .title = degree
     * .item-header .date-badge = year
     * .item-subheader = school and graduation date
   - Skills → .left-column .section "SKILLS" .skills-list li (bullets with asterisk)
   - Certifications → .left-column .section "CERTIFICATION" .certification-item
     * .item-header .title = certification name
     * .item-header .date-badge = date
     * .item-subheader = organization
   
   **If ELEGANT PROFESSIONAL PHOTO:**
   - Name → .right-column h1 (large heading, color: #DC9589, letter-spacing: 0.2em)
   - Role → .right-column .subtitle (p tag, color: #555)
   - Summary → .right-column .right-section "PERSONAL PROFILE" p (expand to 3-5 sentences)
   - Contact → .left-column .left-section "CONTACT" .contact-item (with icon images and p tags)
   - Experience → .right-column .right-section "WORK EXPERIENCE"
     * .job-title = job title (h4, bold)
     * .job-details = company | dates (Playfair Display italic font)
     * .job-description li = bullet points with dash markers (expand descriptions, add more bullets)
   - Education → .right-column .right-section "EDUCATION" .education-item
     * .degree = degree name
     * .institution = school | dates (Playfair Display italic font)
   - Skills → .left-column .left-section "EXPERTISE" ul li
   - Software Knowledge → .left-column .left-section "SOFTWARE KNOWLEDGE" ul li
   - Personal Skills → .left-column .left-section "PERSONAL SKILLS" ul li
   - Languages → Add to .left-column .left-section "LANGUAGES" ul li if space allows
   
   **If B&W PROFESSIONAL:**
   - Name → .header-info h1 (large heading, Montserrat font, font-size: 30px, color: #171e1c)
   - Role → .header-info .job-title (p tag, font-size: 16px, color: #171e1c)
   - Contact → .header-info .contact-info .contact-item (with classes .contact-phone, .contact-email, .contact-web)
   - Summary → .section "ABOUT ME" p (paragraph, expand to 3-5 sentences)
   - Experience → .section "EXPERIENCE" .two-col-section
     * .left-col .date = dates (bold, font-weight: 800)
     * .left-col p = company
     * .right-col h3 = job title (Playfair Display, font-size: 16px, bold)
     * .right-col p = description (expand with more detail)
   - Education → .section "EDUCATION" .two-col-section
     * .left-col .date = dates (bold)
     * .left-col p = school
     * .right-col h3 = degree (Playfair Display, bold)
     * .right-col p = description (expand with more detail)
   - Skills → .section "SKILLS" .skills-grid ul li (4-column grid, bullets with • marker)
   - References → .section "REFERENCES" .references-grid .reference-item (2-column grid)
   - Languages → Add to .section "LANGUAGES" or combine with Skills if space allows
   
   **If BLUE SIMPLE PROFILE:**
   - Name → .header-text h1 (large heading, Inter font, font-size: 37px, font-weight: 800, color: white, positioned absolutely)
   - Role → .header-text p (p tag, font-size: 18px, color: white)
   - Contact → .left-column .section "My Contact" .contact-item (with icon i tags and span)
   - Summary → .right-column .section "About Me" .about-me-text (p tag, expand to 3-5 sentences)
   - Experience → .right-column .section "Professional Experience" .experience-item
     * Structure: h3 (job title + company), .date (dates, italic), .responsibilities-title, .responsibilities-list li (bullets with • marker, color: #1237a9, expand descriptions, add more bullets)
   - Education → .left-column .section "Education Background" .education-list .education-item
     * Structure: .school (school name, bold), .degree (degree name), .completed (completion date)
   - Hard Skills → .left-column .section "Hard Skill" .skills-list li (bullets with • marker, color: #1237a9)
   - Soft Skills → .left-column .section "Soft Skill" .skills-list li (bullets with • marker, color: #1237a9)
   - Achievements → .right-column .section "Achievements" .achievements-container .achievement-item
     * Structure: .date (dates, bold, 80px width), .description (achievement description)
   - Languages → Add to .left-column .section "Languages" or combine with Skills if space allows
   
   **If ACCENT COLOR MINIMAL:**
   - Name → .header-title h1 (large heading, font-size: 34.6px, color: #57b5b2, font-weight: bold)
   - Role → .header-title p (p tag, font-size: 14px, color: #282522)
   - Contact → .header .contact-info div (right-aligned, with icon images)
   - Experience → .section "Work Experience" .section-content
     * Structure: .left-column .item .item-title (job title, normal weight) and .item-date (dates, bold), .right-column .item .item-title (company + location, bold) and .item-description (description - expand with more detail, can include ul li bullets)
   - Education → .section "Education" .section-content
     * Structure: .left-column .item .item-title (degree, normal weight) and .item-date (dates, bold), .right-column .item .item-title (school + location, bold) and .item-description (description - expand with more detail)
   - Skills → .section "Expertise" .expertise-item
     * Structure: .expertise-label (skill name), .expertise-bar with .expertise-level (progress bar, background-color: #57b5b2, use level-1/level-2/level-3 classes for width)
   - References → .section "References" .reference-item
     * Structure: .reference-name (name, bold), .reference-details (title, phone, email)
   - Languages → Add to .section "Languages" or combine with Skills if space allows
   
   **Common:**
   - Format languages: "Language Name - Proficiency Level" (one per <li> or <p>)
   - Remove ALL placeholder text
   - Expand descriptions to fill page 1 completely

3. **Balance columns dynamically** (CRITICAL):
   
   **OLIVE GREEN MODERN:**
   - Analyze content in .left-column vs .right-column
   - Move sections between columns to balance heights
   - Goal: Both columns end at same vertical position
   
   **MODERN PROFESSIONAL:**
   - Analyze content in .left-column (40%) vs .right-column (65%)
   - If right column is much longer, consider moving Skills to right
   - If left column is too short, ensure right column content is well-distributed
   - Goal: Both columns fill page appropriately without empty space
   
   **MINIMALIST SIMPLE PHOTO:**
   - Analyze content in .column-left (flex: 1.5) vs .column-right (flex: 1)
   - Left column has: WORK EXPERIENCE, REFERENCES
   - Right column has: ABOUT ME, EDUCATION, EXPERTISE, LANGUAGE
   - If left is longer, move some content (like Education) to left column
   - If right is longer, move some content to left column
   - Goal: Both columns fill page 1 completely before any content moves to page 2
   - CRITICAL: Fill page 1 completely - expand descriptions, add more items if needed
   
   **COLORFUL BLOCKS:**
   - Analyze content in .left-column (38%) vs .right-column (62%)
   - Left column has: Profile pic, Contact, Skills, Certifications, Memberships (fixed structure)
   - Right column has: Header (name/title/summary), Professional Summary, Education, Experience
   - Left column is mostly fixed - focus on filling right column appropriately
   - If right column is too short, expand experience descriptions, add more summary bullets, expand education details
   - Goal: Both columns fill page 1 completely before any content moves to page 2
   - CRITICAL: Fill page 1 completely - expand experience bullets, add more summary points, expand education
   
   **ELEGANT PROFESSIONAL PHOTO:**
   - Analyze content in .left-column (30%) vs .right-column (70%)
   - Left column has: Profile pic, Contact, Expertise, Software Knowledge, Personal Skills (mostly fixed structure)
   - Right column has: Name/Subtitle, Personal Profile, Work Experience, Education
   - Left column is mostly fixed - focus on filling right column appropriately
   - If right column is too short, expand job descriptions, add more experience bullets, expand personal profile paragraph, expand education details
   - Goal: Both columns fill page 1 completely before any content moves to page 2
   - CRITICAL: Fill page 1 completely - expand job descriptions, add more experience bullets, expand personal profile
   
   **B&W PROFESSIONAL:**
   - Single-column layout with two-column structure for experience/education items
   - Header has: Profile pic, Name, Job Title, Contact info
   - Sections: About Me, Education, Experience, Skills, References
   - Experience/Education use .two-col-section with .left-col (160px) and .right-col (flex-grow)
   - Skills use .skills-grid with 4 columns
   - References use .references-grid with 2 columns
   - If there's empty space, expand job descriptions, add more experience items, expand about me paragraph, expand education descriptions, add more skills
   - Goal: Fill page 1 completely before any content moves to page 2
   - CRITICAL: Fill page 1 completely - expand job descriptions, add more experience items if needed, expand about me paragraph, expand education descriptions
   
   **BLUE SIMPLE PROFILE:**
   - Two-column layout (.left-column 250px width, .right-column 416px width)
   - Header has: .header-bg (blue #1237a9), .header-text (name/title, white text), .profile-pic (positioned absolutely)
   - Footer has: .footer-bg (blue #1237a9)
   - Left column has: Contact, Hard Skill, Soft Skill, Education Background
   - Right column has: About Me, Professional Experience, Achievements
   - Left column is mostly fixed - focus on filling right column appropriately
   - If right column is too short, expand experience descriptions, add more responsibility bullets, expand about me paragraph, expand achievements
   - Goal: Both columns fill page 1 completely before any content moves to page 2
   - CRITICAL: Fill page 1 completely - expand job descriptions, add more responsibility bullets, expand about me paragraph, expand achievements
   
   **ACCENT COLOR MINIMAL:**
   - Single-column layout with two-column structure for experience/education items
   - Header has: Profile pic, Name/Title, Contact info (right-aligned)
   - Sections: Work Experience, Education, References/Expertise
   - Experience/Education use .section-content with .left-column (25%) and .right-column (75%)
   - Skills use .expertise-item with .expertise-bar (progress bars)
   - References use .reference-item
   - If there's empty space, expand job descriptions, add more experience items, expand education descriptions
   - Goal: Fill page 1 completely before any content moves to page 2
   - CRITICAL: Fill page 1 completely - expand job descriptions, add more experience items if needed, expand education descriptions
   
   **All Templates:**
   - Move entire <section> elements between columns if needed
   - Adjust .section { margin-bottom } values (use 20-30px, reduce last section to 0-10px)
   - CRITICAL: Fill page 1 completely before moving to page 2

4. **Fix spacing issues**:
   - Remove ALL empty spaces between sections
   - Set .section:last-child { margin-bottom: 0 } or reduce significantly
   - Remove spacing below last section in each column
   - Make spacing consistent throughout

5. **Fix CSS layout issues** (template-specific):
   
   **OLIVE GREEN MODERN:**
   - Convert .footer from position: absolute to position: relative if it creates empty space
   - Ensure .main-content flex layout works
   - Add CSS if needed: .left-column, .right-column { display: flex; flex-direction: column; }
   
   **MODERN PROFESSIONAL:**
   - Ensure .timeline-container and .timeline-line work correctly
   - Each .timeline-item should have proper structure: .item-header, .item-title, .item-subtitle-wrapper, .item-date, .item-description
   - Preserve .background-shape in .left-column (the beige triangle shape)
   - Keep .left-column background-color: #F7F7F7
   - Keep .right-column background-color: #ffffff
   - Remove duplicate .timeline-item entries
   - Ensure .timeline-line spans the full height of .timeline-container
   
   **MINIMALIST SIMPLE PHOTO:**
   - Preserve .header height: 250px and background-color: #F6F6F6
   - Preserve .header-left padding: 40px 50px
   - Preserve .header-right img height: 250px
   - Preserve .main-content padding: 30px 50px, gap: 40px
   - Preserve .column-left flex: 1.5 and .column-right flex: 1
   - Preserve .section-title ::after underline (width: 40px, height: 3px, background-color: #3b8586)
   - Remove empty spaces by adjusting .section margin-bottom (use 20-30px, last section: 0-10px)
   - CRITICAL: Ensure content fills page 1 completely - if there's empty space, expand descriptions, add more items, or adjust spacing
   
   **COLORFUL BLOCKS:**
   - Preserve .header background-color: #A97C74, color: white, padding: 40px 45px
   - Preserve .left-column width: 38%, background-color: #FDF6EC for .profile-pic-container and .contact-info
   - Preserve .right-column width: 62%, background-color: #FFFFFF
   - Preserve .date-badge background-color: #A97C74, color: white, border-radius: 10px
   - Preserve .footer-bar height: 40px, background-color: #A97C74
   - Preserve .section-title border-bottom: 1px solid #333
   - Preserve asterisk (*) bullet markers for .skills-list li, .summary-list li, .experience-list li
   - Remove empty spaces by adjusting .section margin-top (use 20px)
   - CRITICAL: Ensure content fills page 1 completely - expand experience descriptions, add more summary bullets, expand education details
   
   **ELEGANT PROFESSIONAL PHOTO:**
   - Preserve .left-column width: 30%, padding: 3em 2em
   - Preserve .right-column width: 70%, padding: 3em 3em 3em 2.5em
   - Preserve .image-container background-color: #F7E6E5, padding: 1em 1em 2em
   - Preserve .divider width: 1px, background-color: #e0e0e0, positioned absolutely
   - Preserve .signature font-family: 'Dancing Script', color: #d1a3a4, positioned absolutely (decorative element)
   - Preserve .right-column h1 color: #DC9589, letter-spacing: 0.2em
   - Preserve .right-section h2 color: #DC9589, border-bottom: 1px solid #e0e0e0
   - Preserve .job-details Playfair Display italic font
   - Preserve .job-description li dash (-) bullet markers
   - Preserve .education-item .institution Playfair Display italic font
   - Remove empty spaces by adjusting .right-section margin-bottom (use 1.5em, reduce last section)
   - CRITICAL: Ensure content fills page 1 completely - expand job descriptions, add more experience bullets, expand personal profile paragraph
   
   **Both:**
   - Remove overflow:hidden that clips content
   - Ensure .page padding-bottom is minimal

6. **Preserve original styling**:
   - Keep ALL CSS colors, fonts, and design
   - Keep ALL class names and structure
   - Only modify content text and spacing/layout CSS

CRITICAL: PAGE 1 FILLING REQUIREMENT:
- ALWAYS fill page 1 completely before any content moves to page 2
- If there's empty space on page 1, you MUST:
  1. Expand job descriptions with more detail from the provided data
  2. Add more bullet points or details to experience items
  3. Expand the summary/about me section (use 3-5 sentences instead of 1-2)
  4. Add more skills, languages, or certifications if available
  5. Increase spacing between sections slightly (but keep it consistent)
  6. Add more education details if available
  7. Only if absolutely necessary, adjust font sizes slightly (but preserve template aesthetics)
- Page 1 should be FULLY UTILIZED with no empty space at the bottom
- Only move content to page 2 if page 1 is completely full and content overflows

Return the complete fixed HTML with:
- Template type detected and appropriate fixes applied
- Data correctly populated (name in correct field, role in correct field)
- Columns balanced (appropriate height for template type)
- Page 1 completely filled (no empty space at bottom)
- No empty spaces between sections
- Languages properly formatted
- Original styling preserved

**ABSOLUTE FINAL REQUIREMENT for 2 COLUMN TIMELINE template:**
- The <style> block in your output MUST be EXACTLY the same as the <style> block in the input template HTML
- Copy the style block character-for-character - do NOT modify any CSS rules, properties, or values
- Only modify text content inside HTML tags (like <h1>, <p>, <li>, etc.)
- If you detect this is a 2 COLUMN TIMELINE template, preserve the style block 100% exactly as provided`;

  try {
    // Prefer OpenAI if available (use gpt-4o-mini for faster responses)
    const openai = getOpenAI();
    if (openai) {
      // Use gpt-4o-mini for both streaming and non-streaming for faster responses
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
          temperature: 0.1, // Lower temperature for more deterministic output
          max_tokens: 8000, // Reduced for faster responses - only complete HTML
          top_p: 0.9, // Slightly lower for faster responses
          stream: true, // Enable streaming
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
        
        return html;
      } else {
        // Non-streaming path
        const response = await openai.chat.completions.create({
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.1, // Lower temperature for more deterministic output
          max_tokens: 8000, // Reduced for faster responses - only complete HTML
          top_p: 0.9, // Slightly lower for faster responses
        });

        const apiTime = Date.now() - apiStartTime;
        console.log(`OpenAI API call completed in ${apiTime}ms`);

        let html = response.choices[0]?.message?.content?.trim() || '';
        
        // Extract only HTML content - remove any markdown, explanations, or non-HTML text
        html = extractHtmlOnly(html);
        
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
          temperature: 0.1, // Lower temperature for more deterministic output
          maxOutputTokens: 8000, // Reduced for faster responses - only complete HTML
          topP: 0.9, // Slightly lower for faster responses
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
        
        // Apply deduplication to remove any duplicates created by LLM
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
        
        // Apply deduplication to remove any duplicates created by LLM
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
