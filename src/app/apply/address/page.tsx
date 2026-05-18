"use client";

import { useState, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useFormContext } from "@/lib/form-context";
import { validateRequired, validatePostcode, ValidationError } from "@/lib/validation";
import AiAssistPanel from "@/components/AiAssistPanel";

interface AddressSuggestion {
  label: string;
  line1: string;
  line2: string;
  line3: string;
  postcode: string;
}

export default function AddressPage() {
  const router = useRouter();
  const { formData, updateAddress } = useFormContext();
  const { address } = formData;

  const [errors, setErrors] = useState<ValidationError[]>([]);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  const [line1, setLine1] = useState(address.line1);
  const [line2, setLine2] = useState(address.line2);
  const [line3, setLine3] = useState(address.line3);
  const [postcode, setPostcode] = useState(address.postcode);

  // Lookup state
  const [lookupPostcode, setLookupPostcode] = useState(address.postcode);
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "found" | "error">("idle");
  const [lookupError, setLookupError] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState("");

  // Show address fields immediately if context already has data
  const [showAddressFields, setShowAddressFields] = useState(
    !!(address.line1 || address.line2 || address.line3)
  );
  const [showDropdown, setShowDropdown] = useState(false);

  function getErrorForField(field: string): string | undefined {
    return errors.find((e) => e.field === field)?.message;
  }

  async function handleFindAddress() {
    const trimmed = lookupPostcode.trim().toUpperCase().replace(/\s+/g, " ");
    if (!trimmed) {
      setLookupError("Enter a postcode to search for an address.");
      setLookupStatus("error");
      return;
    }

    setLookupStatus("loading");
    setLookupError("");
    setSuggestions([]);
    setShowDropdown(false);

    try {
      // Step 1: Validate postcode via postcodes.io
      const validationRes = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(trimmed)}`
      );

      if (!validationRes.ok) {
        setLookupError("We could not find addresses for that postcode. Enter your address manually.");
        setLookupStatus("error");
        return;
      }

      const validationData = await validationRes.json();
      if (!validationData.result) {
        setLookupError("We could not find addresses for that postcode. Enter your address manually.");
        setLookupStatus("error");
        return;
      }

      const { admin_district, admin_ward } = validationData.result;
      const town = admin_district || admin_ward || "";

      // Step 2: Try getAddress.io if API key is configured, otherwise generate mock addresses
      // To use real data: set NEXT_PUBLIC_GETADDRESS_API_KEY in your .env.local
      const apiKey = process.env.NEXT_PUBLIC_GETADDRESS_API_KEY;

      if (apiKey) {
        // Real lookup via getAddress.io
        const res = await fetch(
          `https://api.getaddress.io/find/${encodeURIComponent(trimmed)}?api-key=${apiKey}&expand=true`
        );
        if (res.ok) {
          const data = await res.json();
          const mapped: AddressSuggestion[] = (data.addresses || []).map((a: {
            line_1: string; line_2: string; line_3: string; town_or_city: string; postcode?: string;
          }) => ({
            label: [a.line_1, a.line_2, a.line_3, a.town_or_city].filter(Boolean).join(", "),
            line1: a.line_1 || "",
            line2: a.line_2 || "",
            line3: a.town_or_city || a.line_3 || "",
            postcode: trimmed,
          }));
          setSuggestions(mapped);
          setSelectedIndex("");
          setShowDropdown(true);
          setLookupStatus("found");
          return;
        }
      }

      // Step 3: Generate realistic mock addresses for the postcode
      // Uses the postcode's area data from postcodes.io to build plausible addresses
      const mockAddresses = generateMockAddresses(trimmed, town);
      setSuggestions(mockAddresses);
      setSelectedIndex("");
      setShowDropdown(true);
      setLookupStatus("found");

    } catch {
      setLookupError("We could not find addresses for that postcode. Enter your address manually.");
      setLookupStatus("error");
    }
  }

  function generateMockAddresses(postcode: string, town: string): AddressSuggestion[] {
    // Generate realistic house numbers and street names based on the postcode
    // This simulates what a real address API would return for demo purposes
    const streetNames = [
      "High Street", "Church Lane", "Mill Road", "Station Road", "Park Avenue",
      "Victoria Road", "King Street", "Queen Street", "Manor Road", "The Green",
    ];
    const streetName = streetNames[postcode.charCodeAt(0) % streetNames.length];
    const baseNumber = (postcode.charCodeAt(postcode.length - 1) % 20) * 5 + 1;

    const addresses: AddressSuggestion[] = [];
    for (let i = 0; i < 8; i++) {
      const houseNumber = baseNumber + i * 2;
      addresses.push({
        label: `${houseNumber} ${streetName}, ${town}, ${postcode}`,
        line1: `${houseNumber} ${streetName}`,
        line2: "",
        line3: town,
        postcode,
      });
    }
    // Add a few flats
    for (let i = 1; i <= 4; i++) {
      addresses.push({
        label: `Flat ${i}, ${baseNumber} ${streetName}, ${town}, ${postcode}`,
        line1: `Flat ${i}`,
        line2: `${baseNumber} ${streetName}`,
        line3: town,
        postcode,
      });
    }
    return addresses;
  }

  function handleSelectAddress(e: React.ChangeEvent<HTMLSelectElement>) {
    const idx = e.target.value;
    setSelectedIndex(idx);
    if (idx === "") return;

    const chosen = suggestions[parseInt(idx, 10)];
    if (!chosen) return;

    setLine1(chosen.line1);
    setLine2(chosen.line2);
    setLine3(chosen.line3);
    setPostcode(chosen.postcode || lookupPostcode.trim().toUpperCase());
    setShowAddressFields(true);
  }

  function handleEnterManually(e: React.MouseEvent) {
    e.preventDefault();
    setShowDropdown(false);
    setShowAddressFields(true);
    if (!postcode && lookupPostcode) {
      setPostcode(lookupPostcode.trim().toUpperCase());
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const newErrors: ValidationError[] = [];

    const line1Err = validateRequired(line1, "line1", "your address line 1");
    if (line1Err) newErrors.push(line1Err);

    const postcodeErr = validatePostcode(postcode, "postcode");
    if (postcodeErr) newErrors.push(postcodeErr);

    setErrors(newErrors);

    if (newErrors.length > 0) {
      setTimeout(() => errorSummaryRef.current?.focus(), 0);
      return;
    }

    updateAddress({ line1, line2, line3, postcode });
    router.push("/apply/university");
  }

  const line1Error = getErrorForField("line1");
  const postcodeError = getErrorForField("postcode");

  return (
    <div className="govuk-width-container">
      <a href="#" className="govuk-back-link" onClick={(e) => { e.preventDefault(); router.back(); }}>
        Back
      </a>

      <main className="govuk-main-wrapper" id="main-content" role="main">
        {errors.length > 0 && (
          <div className="govuk-error-summary" aria-labelledby="error-summary-title" role="alert" tabIndex={-1} ref={errorSummaryRef} data-module="govuk-error-summary">
            <h2 className="govuk-error-summary__title" id="error-summary-title">There is a problem</h2>
            <div className="govuk-error-summary__body">
              <ul className="govuk-list govuk-error-summary__list">
                {errors.map((err) => (
                  <li key={err.field}><a href={`#${err.field}`}>{err.message}</a></li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <h1 className="govuk-heading-l">Address</h1>

        <AiAssistPanel page="address" />

        <form onSubmit={handleSubmit} noValidate>

          {/* Postcode lookup */}
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="lookup-postcode">
              Postcode
            </label>
            <div className="govuk-hint" id="lookup-postcode-hint">
              Enter your postcode and click Find address, or enter your address manually below.
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", flexWrap: "wrap" }}>
              <input
                className="govuk-input govuk-input--width-10"
                id="lookup-postcode"
                name="lookup-postcode"
                type="text"
                value={lookupPostcode}
                onChange={(e) => {
                  setLookupPostcode(e.target.value);
                  if (!showAddressFields) setPostcode(e.target.value);
                }}
                aria-describedby="lookup-postcode-hint"
                autoComplete="postal-code"
              />
              <button
                type="button"
                className="govuk-button govuk-button--secondary"
                style={{ marginBottom: 0 }}
                onClick={handleFindAddress}
                disabled={lookupStatus === "loading"}
              >
                {lookupStatus === "loading" ? "Searching…" : "Find address"}
              </button>
            </div>
          </div>

          {/* Lookup error */}
          {lookupStatus === "error" && (
            <p className="govuk-error-message" role="alert">
              <span className="govuk-visually-hidden">Error:</span> {lookupError}
            </p>
          )}

          {/* Address dropdown */}
          {showDropdown && suggestions.length > 0 && (
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="address-select">
                Select an address
              </label>
              <select
                className="govuk-select"
                id="address-select"
                value={selectedIndex}
                onChange={handleSelectAddress}
              >
                <option value="">{suggestions.length} address{suggestions.length !== 1 ? "es" : ""} found — select one</option>
                {suggestions.map((s, i) => (
                  <option key={i} value={String(i)}>{s.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Enter manually link */}
          {!showAddressFields && (
            <p className="govuk-body">
              <a href="#" className="govuk-link" onClick={handleEnterManually}>
                Enter address manually
              </a>
            </p>
          )}

          {/* Address fields */}
          {showAddressFields && (
            <>
              <div className={`govuk-form-group${line1Error ? " govuk-form-group--error" : ""}`}>
                <label className="govuk-label" htmlFor="line1">Address line 1</label>
                {line1Error && (
                  <p id="line1-error" className="govuk-error-message">
                    <span className="govuk-visually-hidden">Error:</span> {line1Error}
                  </p>
                )}
                <input
                  className={`govuk-input${line1Error ? " govuk-input--error" : ""}`}
                  id="line1" name="line1" type="text"
                  value={line1} onChange={(e) => setLine1(e.target.value)}
                  aria-describedby={line1Error ? "line1-error" : undefined}
                  autoComplete="address-line1"
                />
              </div>

              <div className="govuk-form-group">
                <label className="govuk-label" htmlFor="line2">Address line 2 (optional)</label>
                <input
                  className="govuk-input" id="line2" name="line2" type="text"
                  value={line2} onChange={(e) => setLine2(e.target.value)}
                  autoComplete="address-line2"
                />
              </div>

              <div className="govuk-form-group">
                <label className="govuk-label" htmlFor="line3">Town or city (optional)</label>
                <input
                  className="govuk-input" id="line3" name="line3" type="text"
                  value={line3} onChange={(e) => setLine3(e.target.value)}
                  autoComplete="address-level2"
                />
              </div>

              <div className={`govuk-form-group${postcodeError ? " govuk-form-group--error" : ""}`}>
                <label className="govuk-label" htmlFor="postcode">Postcode</label>
                {postcodeError && (
                  <p id="postcode-error" className="govuk-error-message">
                    <span className="govuk-visually-hidden">Error:</span> {postcodeError}
                  </p>
                )}
                <input
                  className={`govuk-input govuk-input--width-10${postcodeError ? " govuk-input--error" : ""}`}
                  id="postcode" name="postcode" type="text"
                  value={postcode}
                  onChange={(e) => { setPostcode(e.target.value); setLookupPostcode(e.target.value); }}
                  aria-describedby={postcodeError ? "postcode-error" : undefined}
                  autoComplete="postal-code"
                />
              </div>
            </>
          )}

          <button type="submit" className="govuk-button" data-module="govuk-button">
            Continue
          </button>
        </form>
      </main>
    </div>
  );
}
