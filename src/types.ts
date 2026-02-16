export interface CareerProfile {
  personal?: {
    name: string;
    location?: string;
  };
  contact?: {
    email?: string;
    phone?: string;
    linkedin?: string;
    github?: string;
    website?: string;
  };
  summary?: string;
  items?: Array<{
    id: string;
    category: string;
    title: string;
    description?: string;
    organization?: string;
    dates?: string;
    startDate?: string;
    endDate?: string;
    current?: boolean;
  }>;
}

export interface CareerIntent {
  targetRole: string;
  targetLocation: string;
  jobSearchIntent?: string;
  yearsOfExperience?: number;
}

export interface GenerateResumeRequest {
  profile: CareerProfile;
  intent: CareerIntent;
  templateHtml?: string; // Existing template HTML to populate and fix
  templateStyle?: string; // Template name/style for detection
  templateId?: string; // Template ID/key for precise detection
  options?: {
    fitToOnePage?: boolean;
    hasPhoto?: boolean;
  };
}

export interface GenerateResumeResponse {
  html: string;
  metadata?: {
    generatedAt: string;
    templateStyle?: string;
  };
}
