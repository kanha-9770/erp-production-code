import { z } from "zod";
import { API_KEYS, GEMINI_2_API_URL, GEMINI_1_5_API_URL } from "./apiConfig";
const user_given_prompt="akash";

const ExtractedDataSchema = z.object({
  name: z.string().nullable(),
  companyName: z.string().nullable(),
  website: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  contactNumbers: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  description: z.string().nullable(),
});

type ExtractedData = z.infer<typeof ExtractedDataSchema>;

async function makeApiRequest(
  apiUrl: string,
  apiKey: string,
  data: any
): Promise<Response> {
  const url = ${apiUrl}?key=${apiKey};
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(API request failed: ${response.status});
  }

  return response;
}

async function tryApiKeys(
  apiKeys: string[],
  apiUrl: string,
  data: any
): Promise<Response> {
  const errors: Error[] = [];

  for (const apiKey of apiKeys) {
    try {
      const response = await makeApiRequest(apiUrl, apiKey, data);
      return response;
    } catch (error: any) {
      console.error(API key failed: ${apiKey}. Error: ${error.message});
      errors.push(error as Error);
    }
  }

  throw new AggregateError(errors, "All API keys failed");
}

export async function extractCardDetails(
  frontImageUrl: string,
  backImageUrl: string | null
): Promise<ExtractedData> {
  try {
    console.log("Starting card detail extraction...");

    if (!frontImageUrl) {
      throw new Error("Front image URL is required");
    }

    const frontImageBase64 = await fetchAndEncodeImage(frontImageUrl);
    const backImageBase64 = backImageUrl
      ? await fetchAndEncodeImage(backImageUrl)
      : null;

    const prompt = `   Analyze the provided front and back images of a business card. Extract the following information and format it into a JSON object according to these specifications:

      *   **Name:** The name of the individual.
      *   **Company:** The name of the company.
      *   **Mobile:** The primary contact number.
      *   **Mobile_2:** The second contact number (if present).
      *   **Phone:** A third contact number (if present).
      *   **Address:** The full street address.
      *   **State:** The state within the address.
      *   **Country:** The country within the address. Ensure the country name is spelled correctly and uses its full proper name. Correct any spelling errors.
      *   **Email:** The primary email address.
      *   **Secondary_Email:** A secondary email address (if present).
      *   **Website:** The company website.
      *   **description:** Any additional information that doesn't fit into the above categories, such as a fourth phone number, a second website, a third email, or any unidentifiable text. If no extra information is found, set this to an empty string. If the information is not clear, put in description.

      Follow these rules strictly:

      1.  Extract ALL text visible in the image. Do not omit any text.
      2.  Include ALL contact numbers found, populating \Mobile\, \Mobile_2\, and \Phone\ accordingly.
      3.  Include ALL email addresses found, populating \Email\ and \Secondary_Email\ accordingly.
      4.  If a field is not found, set it to null.
      5.  Do not add any explanations or markdown. Return ONLY the JSON object.
     
      Output the information in a JSON object with the keys exactly as specified above.

      {
        "Name": null,
        "Company": null,
        "Mobile": null,
        "Mobile_2": null,
        "Phone": null,
        "Address": null,
        "State": null,
        "Country": null,
        "Email": null,
        "Secondary_Email": null,
        "Website": null,
        "description": null
      }`;

    const data = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: frontImageBase64,
              },
            },
          ],
        },
      ],
    };

    if (backImageBase64) {
      data.contents[0].parts.push({
        inline_data: {
          mime_type: "image/jpeg",
          data: backImageBase64,
        },
      });
    }

    let response: Response;

    try {
      response = await tryApiKeys(API_KEYS, GEMINI_2_API_URL, data);
    } catch (error) {
      console.log("All Gemini 2.0 API keys failed. Trying Gemini 1.5...");
      try {
        response = await tryApiKeys(API_KEYS, GEMINI_1_5_API_URL, data);
      } catch (error) {
        throw new Error("All API keys failed for both Gemini 2.0 and 1.5");
      }
    }

    const result = await response.json();
    console.log("API Response:", JSON.stringify(result, null, 2));

    if (!result.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.error(
        "Invalid API response structure:",
        JSON.stringify(result, null, 2)
      );
      throw new Error("Invalid API response structure");
    }

    const extractedText = result.candidates[0].content.parts[0].text;
    const jsonStartIndex = extractedText.indexOf("{");
    const jsonEndIndex = extractedText.lastIndexOf("}") + 1;
    const jsonString = extractedText.slice(jsonStartIndex, jsonEndIndex);

    console.log("Extracted JSON string:", jsonString);

    const extractedData = JSON.parse(jsonString);
    console.log("Parsed extracted data:", extractedData);

    const mappedData = {
      name: extractedData.Name || null,
      companyName: extractedData.Company || null,
      website: extractedData.Website || null,
      email: extractedData.Email || null,
      address: extractedData.Address !== null ? extractedData.Address : null,
      contactNumbers:
        [extractedData.Mobile, extractedData.Mobile_2, extractedData.Phone]
          .filter(Boolean)
          .join(", ") || null,
      state: extractedData.State !== null ? extractedData.State : null,
      country: extractedData.Country !== null ? extractedData.Country : null,
      description: extractedData.description !== null ? extractedData.description : null
    };
    console.log("here is mapped data", mappedData);
    
    return ExtractedDataSchema.parse(mappedData);
  } catch (error) {
    console.error("Error in extractCardDetails:", error);
    // Return a default ExtractedData object with all fields set to empty strings
    return {
      name: null,
      companyName: null,
      website: null,
      email: null,
      address: null,
      contactNumbers: null,
      state: null,
      country: null,
      description: null
    };
  }
}

async function fetchAndEncodeImage(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(Failed to fetch image: ${response.statusText});
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}