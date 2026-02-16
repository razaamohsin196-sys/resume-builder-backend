import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { CareerProfile, CareerIntent } from "../types";

// Initialize API clients lazily to ensure env vars are loaded
function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  return key ? new GoogleGenerativeAI(key) : null;
}

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  return key ? new OpenAI({ apiKey: key }) : null;
}

/**
 * Generate complete HTML/CSS resume from scratch using LLM
 * This agent generates responsive, well-formatted HTML with inline CSS
 * based on the data provided, without relying on hardcoded templates
 */
export async function generateResumeHtml(
  profile: CareerProfile,
  intent: CareerIntent,
  options?: { fitToOnePage?: boolean; hasPhoto?: boolean; templateStyle?: string }
): Promise<string> {
  const templateStyle = options?.templateStyle || "modern professional";
  
  // Extract structured data
  const name = profile.personal?.name || "Your Name";
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

  const systemPrompt = `You are an expert HTML/CSS resume generator. Your task is to create a complete, professional resume HTML document with embedded CSS that:

1. **GENERATES COMPLETE HTML/CSS FROM SCRATCH**: Do NOT use placeholder templates. Generate fresh HTML structure with inline CSS that adapts to the content.

2. **RESPONSIVE LAYOUT**: 
   - Use CSS Grid or Flexbox for layout
   - Ensure content flows naturally without empty spaces
   - Adapt spacing based on content length
   - Use min-height instead of fixed heights to prevent clipping

3. **PROFESSIONAL DESIGN**:
   - Modern, clean typography
   - Proper spacing and margins
   - Color scheme: ${templateStyle}
   - Print-friendly (A4 size: 210mm x 297mm or 8.27" x 11.69")
   - Professional color palette

4. **NO HARDCODED VALUES**:
   - Do NOT use fixed heights that cause empty spaces
   - Use min-height and auto heights
   - Let content determine spacing
   - Remove any empty sections or placeholders

5. **COMPLETE STRUCTURE**:
   - DOCTYPE and html tags
   - Complete <head> with meta tags and title
   - Embedded <style> tag with all CSS
   - Complete <body> with all sections

6. **DATA POPULATION**:
   - Use ALL provided data
   - Do NOT leave placeholders like "Unknown", "Your Name", etc.
   - If name is missing, use a reasonable default or leave it empty
   - Populate all sections with actual data
   - Format dates consistently

7. **SECTIONS TO INCLUDE** (only if data exists):
   - Header with name, title, and contact info
   - Professional Summary (if summary exists)
   - Work Experience (if experiences exist)
   - Education (if education exists)
   - Skills (if skills exist)
   - Projects (if projects exist)
   - Certifications (if certifications exist)

8. **FORMATTING RULES**:
   - Use semantic HTML
   - Proper heading hierarchy (h1, h2, h3)
   - Clean list formatting for skills and bullets
   - Consistent date formatting
   - Professional bullet points for experience

9. **CSS REQUIREMENTS**:
   - All CSS must be in a <style> tag in the <head>
   - Use CSS variables for colors if using a color scheme
   - Ensure print styles (@media print)
   - No overflow issues
   - Content should flow naturally across pages if needed

10. **OUTPUT FORMAT**:
    - Return ONLY the complete HTML document
    - No markdown code blocks
    - No explanations
    - Just the HTML string

${options?.fitToOnePage ? `
11. **ONE PAGE CONSTRAINT**:
    - MUST fit on a single A4 page
    - Use compact spacing
    - Limit to most recent 3-4 roles
    - Limit bullets to 2-3 per role
    - Condense summary to 2-3 lines
    - Use smaller fonts if needed
` : ''}

Generate a complete, professional resume HTML document.`;

  const userPrompt = `Generate a ${templateStyle} resume with the following data:

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
- Company/Organization: ${exp.organization || ''}
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

TARGET ROLE: ${intent.targetRole}
TARGET LOCATION: ${intent.targetLocation}
${intent.jobSearchIntent ? `JOB DESCRIPTION:\n${intent.jobSearchIntent}` : ''}

Generate the complete HTML resume now.`;

  try {
    // Prefer OpenAI if available (better quality with gpt-4o)
    const openai = getOpenAI();
    if (openai) {
      console.log("Using OpenAI (gpt-4o) for resume generation");
      const apiStartTime = Date.now();
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2, // Lower temperature for faster, more deterministic responses
        max_tokens: 16000, // Limit response to prevent overly long generations
        top_p: 0.95, // Nucleus sampling for faster generation
      });

      const apiTime = Date.now() - apiStartTime;
      console.log(`OpenAI API call completed in ${apiTime}ms`);

      let html = response.choices[0]?.message?.content?.trim() || '';
      
      // Clean up markdown code blocks if present
      html = html.replace(/```html/g, '').replace(/```/g, '').trim();
      
      return html;
    }

    // Fallback to Gemini if OpenAI is not available
    const genAI = getGenAI();
    if (genAI) {
      console.log("Using Gemini (gemini-2.0-flash-exp) for resume generation");
      const apiStartTime = Date.now();
      
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash-exp",
        generationConfig: {
          responseMimeType: "text/plain",
          temperature: 0.2, // Lower temperature for faster responses
          maxOutputTokens: 16000, // Limit response length
          topP: 0.95, // Nucleus sampling
        }
      });

      const result = await model.generateContent({
        contents: [
          { role: "model", parts: [{ text: systemPrompt }] },
          { role: "user", parts: [{ text: userPrompt }] }
        ]
      });

      const apiTime = Date.now() - apiStartTime;
      console.log(`Gemini API call completed in ${apiTime}ms`);

      let html = result.response.text().trim();
      
      // Clean up markdown code blocks if present
      html = html.replace(/```html/g, '').replace(/```/g, '').trim();
      
      // Validate HTML
      if (html.includes('<!DOCTYPE') || html.includes('<html') || html.includes('<style')) {
        return html;
      }
    }

    throw new Error("No AI provider available");
  } catch (error: any) {
    console.error("Error generating resume:", error);
    throw new Error(`Failed to generate resume: ${error.message}`);
  }
}
