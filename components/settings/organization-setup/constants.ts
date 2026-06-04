/**
 * Static option lists for the Organization Setup → Organization Details form.
 * Kept in one place so the form and any future consumers stay in sync.
 */

export const ORG_TYPES: string[] = [
  "HR & Related Services",
  "Manufacturing",
  "IT & Software",
  "Retail & E-commerce",
  "Finance & Banking",
  "Healthcare & Pharma",
  "Education & Training",
  "Construction & Real Estate",
  "Logistics & Transportation",
  "Hospitality & Travel",
  "Media & Entertainment",
  "Consulting & Professional Services",
  "Non-Profit / NGO",
  "Government & Public Sector",
  "Other",
];

// Common countries surfaced first; the list is intentionally short and
// India-default to match the primary user base. "Other" is implicit — the
// select lets users pick from this list; a free-form state input covers the
// long tail of regions.
export const COUNTRIES: string[] = [
  "India",
  "United States",
  "United Kingdom",
  "United Arab Emirates",
  "Canada",
  "Australia",
  "Singapore",
  "Germany",
  "France",
  "Netherlands",
  "Saudi Arabia",
  "Qatar",
  "Malaysia",
  "Japan",
  "China",
  "South Africa",
  "Brazil",
  "Other",
];

export const WEEKDAYS: string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const MONTHS: string[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const DATE_FORMATS: string[] = [
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "YYYY-MM-DD",
  "DD-MMM-YYYY",
];

// Common IANA timezones, India first to match the primary user base.
export const COMMON_TIMEZONES: string[] = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

// Indian states + UTs — shown as a Select when Country === "India".
export const INDIAN_STATES: string[] = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];
