import { GoogleGenAI, Chat, GenerateContentResponse, Content } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const BASE_SYSTEM_INSTRUCTION = `
You are an expert LaTeX and TikZ and tkz-euclide specialist. 
Your task is to generate high-quality, compilable "standalone" TikZ LaTeX code based on geometric data or user descriptions.
If the tkz-euclide package is used, the base package should also be installed using the \\usepackage{tkz-base} command if necessary.

Rules:
1. Output ONLY the raw LaTeX code. Do not wrap it in markdown code blocks (like \`\`\`latex ... \`\`\`) and do not provide conversational text unless strictly necessary to explain a fatal error.
2. The output must be a complete document starting with \\documentclass and ending with \\end{document}.
3. **DOCUMENT CLASS:** Always use \\documentclass[margin=3.14mm]{standalone} unless specifically asked otherwise.
4. **PACKAGES:** 
   - {PACKAGE_INSTRUCTION}
   - Include \\usetikzlibrary{calc, patterns, angles, quotes, intersections, babel}.
   - CRITICAL FOR TURKISH LANGUAGE: Don't use \\usepackage[turkish]{babel}.
5. **FONTS:** Do NOT use TeX Gyre fonts in standalone mode to avoid conflicts. Use default LaTeX fonts.
6. **METADATA:** Add the following comment at the very top of the TikZ code: "%Bu doküman Ali İhsan Çanakoğlu tarafından oluşturulmuştur."
7. **GEOMETRY FIDELITY:** 
   - When provided with raw input data (coordinates, shapes), PRESERVE the geometry exactly.
   - Do NOT change coordinates unless asked to "fix" or "align" them.
   - **AXES & GRID:** If the input data contains commands for a grid (e.g., \\draw ... grid) or axes (e.g., \\draw -> ... node {$x$}), you MUST include them in the final output. They are intentional parts of the requested diagram.
   - "Decorations" refers to *unrequested extra embellishments*. Do NOT remove functional elements like grids or axes provided in the source.
8. **COLOR & STYLE:**
   - Use the specific colors provided in the input data.
   - If a color is black, greyish-blue (slate), or the default yellow, do NOT add explicit color commands or definitions. Draw them as the default TikZ color (black).
   - Dimensions extension lines should inherit the color of the dimension arrow.

{DOCUMENTATION_RULE}
`;

// Helper function for delay
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const createChatSession = (modelId: string, exportMode: 'standard' | 'tkz-euclide' | 'luamplib', history?: Content[]): Chat => {
  let packageInstruction = "Always include \\usepackage{tikz}.";
  
  // Default rule for Standard TikZ
  let documentationRule = `9. **OFFICIAL REFERENCE:**
   - Refer to the official PGF/TikZ documentation at https://tikz.dev/ for command syntax, keys, and libraries.
   - Use modern syntax and standard libraries as described in this documentation.`;
  
  if (exportMode === 'tkz-euclide') {
    packageInstruction = "Always include \\usepackage{tkz-euclide}.";
    // Explicitly reference the documentation URL provided by the user for tkz-euclide
    documentationRule = `9. **OFFICIAL REFERENCE & SYNTAX:**
   - STRICTLY FOLLOW the syntax and conventions defined in the official tkz-euclide documentation PDF at: 
     https://altermundus.fr/files/tkz-euclide/tkz-euclide.pdf
   - Refer to this document for the most accurate macro usage (e.g., \\tkzDefPoint, \\tkzDrawCircle, \\tkzMarkAngle).
   - Prioritize modern syntax (v3.06+) over obsolete commands.`;
  } else if (exportMode === 'luamplib') {
    packageInstruction = "Always include \\usepackage{luamplib}.";
    documentationRule = `9. **OFFICIAL REFERENCE & SYNTAX (LUAMPLIB/METAPOST):**
   - The user requires the output to be compiled with LuaLaTeX using the luamplib package.
   - STRICTLY FOLLOW the documentation found at: https://fosszone.csd.auth.gr/CTAN/macros/luatex/generic/luamplib/luamplib.pdf
   - Wrap all MetaPost code inside the environment: \\begin{mplibcode} ... \\end{mplibcode}.
   - Begin the figure with 'beginfig(1);' and end with 'endfig;'.
   - Use MetaPost syntax (e.g., 'draw (0,0)--(10,10);').
   - Convert coordinate units appropriately (e.g., 'u:=1cm;').`;
  }

  const systemInstruction = BASE_SYSTEM_INSTRUCTION
    .replace("{PACKAGE_INSTRUCTION}", packageInstruction)
    .replace("{DOCUMENTATION_RULE}", documentationRule);

  return ai.chats.create({
    model: modelId,
    config: {
      systemInstruction: systemInstruction,
      temperature: 0.1, // Low temperature for precise code generation
    },
    history: history
  });
};

export const sendChatMessage = async (
  chat: Chat, 
  text: string, 
  inlineData?: { data: string; mimeType: string }
): Promise<string> => {
  const parts: any[] = [];
  if (inlineData) {
    parts.push({ inlineData });
  }
  parts.push({ text });

  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (true) {
    try {
      const response = await chat.sendMessage({ message: parts });
      const responseText = response.text || "";

      if (!responseText) {
        throw new Error("The model returned an empty response.");
      }
      
      return cleanLatexCode(responseText);
    } catch (error: any) {
      console.error(`Gemini API Error (Attempt ${retryCount + 1}):`, error);
      
      let detailedMessage = "Unknown error occurred.";
      if (error instanceof Error) {
        detailedMessage = error.message;
      }

      const lowerMsg = detailedMessage.toLowerCase();
      let isRateLimit = lowerMsg.includes("429") || lowerMsg.includes("quota") || lowerMsg.includes("resource exhausted");

      // Handle JSON error format if present
      try {
         const jsonError = JSON.parse(detailedMessage);
         if (jsonError.error) {
           if (jsonError.error.code === 429 || jsonError.error.status === 'RESOURCE_EXHAUSTED') {
             isRateLimit = true;
           }
           detailedMessage = jsonError.error.message || detailedMessage;
         }
      } catch (e) {
        // Not JSON
      }

      if (isRateLimit && retryCount < MAX_RETRIES) {
        retryCount++;
        const delayTime = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
        console.warn(`Rate limit hit. Retrying in ${delayTime.toFixed(0)}ms...`);
        await wait(delayTime);
        continue;
      }

      if (lowerMsg.includes("safety") || lowerMsg.includes("blocked")) {
        throw new Error("Generation blocked by safety filters.");
      }

      throw new Error(`Generation failed: ${detailedMessage}`);
    }
  }
};

export const cleanLatexCode = (text: string): string => {
  return text
    .replace(/^```latex\n/i, '')
    .replace(/^```\n/i, '')
    .replace(/\n```$/, '')
    .trim();
};