import type { SosText } from "./sos-text";

/**
 * TF-63: ข้อความตัวตรวจและตัวส่งฟอร์ม SOS ภาษาอังกฤษ (type เดียวกับ SOS_TEXT_TH ขาด key แล้ว typecheck ล้ม)
 * โหลดเฉพาะหน้า /en ผ่าน reporter-text.en.ts
 */
export const SOS_TEXT_EN: SosText = {
  locale: "en",
  steps: [
    {
      title: "What happened",
      shortLabel: "Incident",
      description: "Choose the type of incident and confirm that you are at the scene",
    },
    {
      title: "Incident details",
      shortLabel: "Details",
      description:
        "Answer questions about danger and the number of people so rescue teams can prioritize",
    },
    {
      title: "Location",
      shortLabel: "Location",
      description:
        "Share your GPS location or drop a pin on the map, plus a clearly visible landmark",
    },
    {
      title: "What you need",
      shortLabel: "Needs",
      description: "Choose urgent needs such as evacuation, drinking water, food, or medicine",
    },
    {
      title: "Your contact details",
      shortLabel: "Contact",
      description: "Give your name and phone number so the rescue team can call you back",
    },
  ],
  stepProgress: "Step {step} of {total}",
  listComma: ", ",
  listAnd: " and ",
  v: {
    atSceneOnly: "You cannot report for someone else. Please call an emergency hotline instead.",
    incidentInvalid: "This incident type does not exist",
    incidentRequired: "Please choose the type of incident",
    sumAtScene: "whether you are at the scene",
    sumIncident: "incident type",
    dangerRequired: 'Please choose what applies, or tap "None of these"',
    dangerInvalid: "This option does not exist",
    sumDanger: "danger signs",
    selfEvacRequired: "Please answer whether you can get out by yourself",
    sumSelfEvac: "can you get out by yourself",
    waterLevelInvalid: "This water level option does not exist",
    sumWaterLevel: "water level",
    questionRequired: 'Please answer "{label}"',
    questionChoiceInvalid: 'The answer to "{label}" is not valid',
    questionNumberRange: 'Please enter "{label}" as a number from {min} to {max}',
    questionTextTooLong: '"{label}" must be at most {max} characters',
    peopleRequired: "There must be at least 1 person (pets are not counted)",
    sumPeople: "at least 1 person",
    locationRequired: "Please get your GPS location or tap the map to drop a pin",
    locationInaccurate:
      "The location from this device is not accurate. Please tap the map, paste a Google Maps link, or enter your address.",
    locationOutsideThailand: "This location is outside Thailand",
    sumLocation: "location",
    addressRequired:
      "The location from your device is not accurate. Please enter your address so the rescue team can find you.",
    sumAddress: "address",
    landmarkRequired:
      "Please describe a landmark, such as the roof color, the number of floors, or a nearby place",
    sumLandmark: "landmark",
    otherDetailRequired: "Please describe your other needs before going to the next step",
    sumOtherDetail: "details of other needs",
    otherDetailTooLong: "Details of other needs must be at most 200 characters",
    sumOtherDetailTooLong: "details of other needs (at most 200 characters)",
    nameRequired: "Please enter your name or a contact name",
    sumName: "name",
    phoneRequired: "Please enter a phone number we can call you back on",
    phoneInvalid: "Please enter a valid Thai phone number (for example 0812345678)",
    sumPhone: "phone number",
    sumPhoneInvalid: "a valid Thai phone number",
    notesTooLong: "Additional details must be at most 500 characters",
    sumNotesTooLong: "additional details (at most 500 characters)",
    sumNotes: "additional details",
    consentRequired: "Please give your consent before sending the request",
    sumConsent: "consent to use your information",
    healthConsentRequired: "Please consent to the use of health information",
    sumHealthConsent: "consent to use health information",
    photosTooMany: "You can attach at most {max} photos",
    sumPhotosTooMany: "at most {max} photos",
    photoTooLarge: "A photo is larger than 500 KB. Please remove it and choose again.",
    sumPhotoTooLarge: "photos of at most 500 KB",
  },
  gps: {
    deniedDesktop:
      "Location permission was not granted · You can still tap or drag the pin on the map to set your location",
    deniedMobile: "Location not allowed · Tap or drag the pin on the map instead",
    failedDesktop: "Could not get your GPS location · Please tap or drag the pin on the map",
    failedMobile: "Could not get GPS · Tap or drag the pin on the map instead",
    inaccurateDesktop: "{message} (accuracy ±{meters} meters)",
    lowDesktop:
      "Accuracy ±{meters} meters (more than 100 m) · Please tap or drag the pin on the map to mark the exact spot",
    lowMobile: "Accuracy ±{meters} m (over 100 m). Please move the pin on the map.",
    okDesktop: "Location found · accurate to ±{meters} meters · drag the pin to adjust",
    okMobile: "Location found (±{meters} m)",
    pinnedDesktop: "Pin dropped · drag the pin on the map to adjust",
    pinnedMobile: "Pin dropped",
  },
  submit: {
    invalidStep5: "Cannot send yet. Please check: {items}",
    invalidStep1: "Cannot send yet. Please answer {items} in step 1",
    invalidStep2: "Cannot send yet. Please check the details in step 2: {items}",
    invalidStep4: "Cannot send yet. Please describe your other needs in step 4",
    invalidStep3: "Cannot send yet. Please provide {items} in step 3 before sending",
    apiError: "We could not send your request right now. Please try again or call 1669 / 1784.",
    networkError: "No network connection. Your answers are saved on this device.",
    photoRejected: "Photos could not be attached, but the rescue team has received your request.",
    photoFailed:
      "Photos could not be attached right now, but the rescue team has received your request.",
    success: "Request sent. Your case code is {code}",
    successWithWarning: "Request sent. Your case code is {code} — {warning}",
    supplemented:
      "Your new details were sent to the team. To track the case, use the case code you received when you first asked for help.",
  },
  duplicate: {
    samePhoneTitle: "This phone number already has an open request",
    samePhoneBody:
      "If this is the same emergency, tap “Update my earlier request” to send the new details to the team. If it is a new emergency, tap “Create a new request”.",
    nearbyTitle: "Someone nearby has already asked for help",
    nearbyBody: "Rescue teams will see both requests. You can send yours now.",
    updateExisting: "Update my earlier request",
    createNew: "Create a new request",
    sendMine: "Send my request",
    sending: "Sending…",
    back: "Go back and edit",
  },
};
