import { baseApi } from "./baseApi";

/** Structured resume parse — mirrors ParsedResume in lib/ai/resume-parser.ts. */
export interface ParsedResume {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  currentTitle: string | null;
  totalExperience: string | null;
  summary: string | null;
  skills: string[];
  education: Array<{
    degree: string | null;
    institution: string | null;
    year: string | null;
  }>;
  experience: Array<{
    company: string | null;
    role: string | null;
    duration: string | null;
  }>;
  certifications: string[];
  languages: string[];
}

export interface ResumeScanResult {
  text: string;
  data: ParsedResume | null;
  skills: string | null;
  totalExperience: string | null;
  education: string | null;
  summary: string | null;
}

interface ParseResumeResponse {
  success: boolean;
  data: { result: ResumeScanResult };
}

export const resumeApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    parseResume: builder.mutation<ResumeScanResult, FormData>({
      query: (formData) => ({
        url: "/parse-resume",
        method: "POST",
        body: formData,
      }),
      transformResponse: (res: ParseResumeResponse) => res.data.result,
    }),
  }),
});

export const { useParseResumeMutation } = resumeApi;
