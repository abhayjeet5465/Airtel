/** Customer-facing messages for engine codes (rules, reasons, KYC findings), English + Hindi.
 *  These templates are also the fallback "explanation" when the LLM is unavailable. */
import type { Lang } from "./types.ts";

type Dict = Record<string, { en: string; hi: string }>;

export const MESSAGES: Dict = {
  // eligibility rules
  "rule.city_tier": { en: "{product} is only sold in tier {tiers} cities; your city is tier {tier}.", hi: "{product} केवल टियर {tiers} शहरों में उपलब्ध है; आपका शहर टियर {tier} है।" },
  "rule.min_employees": { en: "{product} needs at least {min} staff; you have {actual}.", hi: "{product} के लिए कम से कम {min} कर्मचारी चाहिए; आपके पास {actual} हैं।" },
  "rule.min_sites": { en: "{product} needs at least {min} locations; you have {actual}.", hi: "{product} के लिए कम से कम {min} स्थान चाहिए; आपके पास {actual} हैं।" },
  "rule.gstin_missing": { en: "{product} needs an active GSTIN. You can add it once you register for GST.", hi: "{product} के लिए सक्रिय GSTIN ज़रूरी है। GST पंजीकरण के बाद आप इसे जोड़ सकते हैं।" },
  "rule.gstin_cancelled": { en: "{product} needs an active GSTIN; yours is cancelled.", hi: "{product} के लिए सक्रिय GSTIN ज़रूरी है; आपका GSTIN रद्द है।" },
  "rule.gstin_suspended": { en: "{product} needs an active GSTIN; yours is suspended.", hi: "{product} के लिए सक्रिय GSTIN ज़रूरी है; आपका GSTIN निलंबित है।" },
  "rule.gstin_not_active": { en: "{product} needs an active GSTIN.", hi: "{product} के लिए सक्रिय GSTIN ज़रूरी है।" },
  "rule.dependency": { en: "{product} works only with one of: {needsOneOf}.", hi: "{product} केवल इनमें से किसी एक के साथ काम करता है: {needsOneOf}।" },
  "rule.unknown_product": { en: "This product is not in the catalogue.", hi: "यह उत्पाद सूची में नहीं है।" },
  "rule.quantity": { en: "Quantity must be at least 1.", hi: "मात्रा कम से कम 1 होनी चाहिए।" },
  "rule.redundant": { en: "Your bundle has two plans that do the same job.", hi: "आपके बंडल में एक ही काम के दो प्लान हैं।" },

  // recommendation reasons
  "reason.link.fwa": { en: "5G AirFiber: no cable digging, installed in about 2 days, shortest lock-in (6 months).", hi: "5G AirFiber: बिना तार बिछाए, लगभग 2 दिन में इंस्टॉल, सबसे छोटा अनुबंध (6 महीने)।" },
  "reason.link.fibre100": { en: "Fibre 100 Mbps: steady wired internet for UPI, billing and calls.", hi: "फाइबर 100 Mbps: UPI, बिलिंग और कॉल के लिए स्थिर वायर्ड इंटरनेट।" },
  "reason.link.fibre300": { en: "Fibre 300 Mbps: enough speed for a larger team or several sites.", hi: "फाइबर 300 Mbps: बड़ी टीम या कई स्थानों के लिए पर्याप्त स्पीड।" },
  "reason.link.gigabit": { en: "1 Gbps fibre with priority support for a large office.", hi: "बड़े ऑफिस के लिए प्राथमिकता सपोर्ट वाला 1 Gbps फाइबर।" },
  "reason.link.dedicated": { en: "Dedicated leased line with an uptime guarantee, as you asked.", hi: "आपके अनुरोध के अनुसार, अपटाइम गारंटी वाली डेडिकेटेड लीज़्ड लाइन।" },
  "reason.link.wired_needed": { en: "Wired fibre, because backup internet, SD-WAN, firewall or a static IP need a wired line.", hi: "वायर्ड फाइबर, क्योंकि बैकअप इंटरनेट, SD-WAN, फ़ायरवॉल या स्टैटिक IP के लिए वायर्ड लाइन ज़रूरी है।" },
  "reason.requested": { en: "You asked for this.", hi: "आपने यह माँगा था।" },
  "reason.per_site": { en: "One per location.", hi: "हर स्थान के लिए एक।" },
  "reason.per_camera": { en: "Priced per camera.", hi: "प्रति कैमरा मूल्य।" },
  "reason.per_line": { en: "Priced per phone line.", hi: "प्रति फ़ोन लाइन मूल्य।" },
  "reason.per_user": { en: "Priced per user.", hi: "प्रति उपयोगकर्ता मूल्य।" },
  "reason.per_device": { en: "Priced per device.", hi: "प्रति डिवाइस मूल्य।" },
  "reason.per_vehicle": { en: "Priced per vehicle.", hi: "प्रति वाहन मूल्य।" },
  "reason.per_channel": { en: "Priced per call channel.", hi: "प्रति कॉल चैनल मूल्य।" },
  "note.nothing_unrequested": { en: "We added only what you asked for. Optional extras are below; nothing is pre-selected.", hi: "हमने केवल वही जोड़ा जो आपने माँगा। अतिरिक्त विकल्प नीचे हैं; कुछ भी पहले से चुना नहीं गया है।" },
  "note.no_gstin_path": { en: "Without GST you can still get internet, billing, website and CCTV today. WhatsApp API, SMS and leased lines unlock once you have an active GSTIN.", hi: "GST के बिना भी आज इंटरनेट, बिलिंग, वेबसाइट और CCTV मिल सकते हैं। WhatsApp API, SMS और लीज़्ड लाइन सक्रिय GSTIN के बाद उपलब्ध होंगे।" },
  "note.gstin_inactive": { en: "Your GSTIN is not active, so GST-only products are not offered. Everything else is available.", hi: "आपका GSTIN सक्रिय नहीं है, इसलिए GST वाले उत्पाद उपलब्ध नहीं हैं। बाकी सब उपलब्ध है।" },

  // KYC findings (customer-safe wording; never accusatory)
  "kyc.missing_document": { en: "{document} not uploaded yet.", hi: "{document} अभी अपलोड नहीं हुआ है।" },
  "kyc.unreadable_image": { en: "{document} photo is too blurred to read. Please retake it in good light, flat on a table.", hi: "{document} की फ़ोटो धुंधली है। कृपया अच्छी रोशनी में, मेज़ पर रखकर दोबारा फ़ोटो लें।" },
  "kyc.gstin_blank": { en: "The GSTIN on the certificate is empty.", hi: "प्रमाणपत्र पर GSTIN खाली है।" },
  "kyc.gstin_format": { en: "We could not read a valid GSTIN on the certificate. A team member will check it.", hi: "प्रमाणपत्र पर मान्य GSTIN नहीं पढ़ा जा सका। हमारी टीम इसकी जाँच करेगी।" },
  "kyc.gstin_checksum": { en: "The GSTIN printed on this certificate is not a valid GSTIN. Please upload the certificate downloaded from the GST portal.", hi: "इस प्रमाणपत्र पर छपा GSTIN मान्य नहीं है। कृपया GST पोर्टल से डाउनलोड किया गया प्रमाणपत्र अपलोड करें।" },
  "kyc.gstin_not_found": { en: "This GSTIN was not found in the (simulated) registry.", hi: "यह GSTIN (सिम्युलेटेड) रजिस्ट्री में नहीं मिला।" },
  "kyc.gstin_cancelled": { en: "This GSTIN is cancelled. You can still buy products that don't need GST, or continue once it is active again.", hi: "यह GSTIN रद्द है। आप बिना GST वाले उत्पाद ले सकते हैं, या GSTIN फिर से सक्रिय होने पर आगे बढ़ें।" },
  "kyc.gstin_suspended": { en: "This GSTIN is suspended. You can still buy products that don't need GST.", hi: "यह GSTIN निलंबित है। आप बिना GST वाले उत्पाद ले सकते हैं।" },
  "kyc.legal_name_mismatch_registry": { en: "The legal name on the certificate does not match GST records. Please upload the original certificate from the GST portal.", hi: "प्रमाणपत्र पर कानूनी नाम GST रिकॉर्ड से मेल नहीं खाता। कृपया GST पोर्टल से मूल प्रमाणपत्र अपलोड करें।" },
  "kyc.trade_name_mismatch_registry": { en: "The trade name on the certificate does not match GST records.", hi: "प्रमाणपत्र पर व्यापार नाम GST रिकॉर्ड से मेल नहीं खाता।" },
  "kyc.address_mismatch_registry": { en: "The address on the certificate differs from GST records. A team member will check it.", hi: "प्रमाणपत्र का पता GST रिकॉर्ड से अलग है। हमारी टीम इसकी जाँच करेगी।" },
  "kyc.udyam_blank": { en: "The Udyam registration number on the certificate is empty. A team member will check it.", hi: "प्रमाणपत्र पर उद्यम पंजीकरण संख्या खाली है। हमारी टीम इसकी जाँच करेगी।" },
  "kyc.udyam_format": { en: "We could not read a valid Udyam number.", hi: "मान्य उद्यम संख्या नहीं पढ़ी जा सकी।" },
  "kyc.udyam_not_found": { en: "This Udyam number was not found in the (simulated) registry.", hi: "यह उद्यम संख्या (सिम्युलेटेड) रजिस्ट्री में नहीं मिली।" },
  "kyc.enterprise_name_mismatch_registry": { en: "The business name on the Udyam certificate does not match Udyam records.", hi: "उद्यम प्रमाणपत्र पर व्यवसाय का नाम उद्यम रिकॉर्ड से मेल नहीं खाता।" },
  "kyc.state_mismatch_registry": { en: "The state on the Udyam certificate differs from records.", hi: "उद्यम प्रमाणपत्र पर राज्य रिकॉर्ड से अलग है।" },
  "kyc.city_mismatch_registry": { en: "The city on the Udyam certificate differs from records.", hi: "उद्यम प्रमाणपत्र पर शहर रिकॉर्ड से अलग है।" },
  "kyc.udyam_available_via_lookup": { en: "No need to upload a Udyam certificate: we can fetch your Udyam record ({udyam}) with your consent.", hi: "उद्यम प्रमाणपत्र अपलोड करने की ज़रूरत नहीं: आपकी सहमति से हम आपका उद्यम रिकॉर्ड ({udyam}) प्राप्त कर सकते हैं।" },
  "kyc.gstin_resolved_via_record": { en: "We found your business from your details, but still need a clear photo of the GST certificate.", hi: "हमने आपके विवरण से आपका व्यवसाय ढूँढ लिया, लेकिन GST प्रमाणपत्र की साफ़ फ़ोटो अभी भी चाहिए।" },
  "kyc.id_expired": { en: "The signatory ID expired on {validTill}. Please upload a valid ID.", hi: "हस्ताक्षरकर्ता की ID {validTill} को समाप्त हो गई। कृपया मान्य ID अपलोड करें।" },
  "kyc.signatory_not_proprietor": { en: "The ID belongs to {holder}, but the registered proprietor is {proprietor}. An authorisation letter is needed.", hi: "ID {holder} की है, लेकिन पंजीकृत मालिक {proprietor} हैं। प्राधिकरण पत्र आवश्यक है।" },
  "kyc.signatory_not_applicant": { en: "The ID belongs to {holder}, not {applicant} who applied. Please add an authorisation letter signed by a partner or director.", hi: "ID {holder} की है, आवेदक {applicant} की नहीं। कृपया पार्टनर या डायरेक्टर द्वारा हस्ताक्षरित प्राधिकरण पत्र जोड़ें।" },
  "kyc.designation_atypical": { en: "Designation '{designation}' is unusual for a {constitution}.", hi: "{constitution} के लिए पद '{designation}' असामान्य है।" },
  "kyc.id_business_mismatch": { en: "The ID was issued for a different business name.", hi: "ID किसी अलग व्यवसाय के नाम पर जारी है।" },
  "kyc.address_proof_stale": { en: "Your bill is dated {billDate}, which is {ageDays} days old. Please upload a bill from the last {limit} days.", hi: "आपका बिल {billDate} का है, यानी {ageDays} दिन पुराना। कृपया पिछले {limit} दिनों का बिल अपलोड करें।" },
  "kyc.address_proof_future_dated": { en: "The bill date is in the future. A team member will check it.", hi: "बिल की तारीख भविष्य की है। हमारी टीम इसकी जाँच करेगी।" },
  "kyc.bill_date_unreadable": { en: "We could not read the bill date.", hi: "बिल की तारीख नहीं पढ़ी जा सकी।" },
  "kyc.address_mismatch": { en: "The bill address differs from your GST address.", hi: "बिल का पता आपके GST पते से अलग है।" },
  "kyc.billed_to_mismatch": { en: "The bill is in the name of {billedTo}, not {expected}.", hi: "बिल {billedTo} के नाम पर है, {expected} के नाम पर नहीं।" },
  "kyc.cross_doc_name_mismatch": { en: "The business name '{onDocument}' differs from '{expected}' on your other documents.", hi: "व्यवसाय का नाम '{onDocument}' आपके अन्य दस्तावेज़ों के '{expected}' से अलग है।" },
  "kyc.legal_vs_trade_name_internal": { en: "The certificate refers to two different business names. Please upload the original from the GST portal.", hi: "प्रमाणपत्र में दो अलग व्यवसाय नाम हैं। कृपया GST पोर्टल से मूल प्रमाणपत्र अपलोड करें।" },
  "kyc.date_mismatch_registry": { en: "Registration date differs from records (informational).", hi: "पंजीकरण तिथि रिकॉर्ड से अलग है (केवल जानकारी)।" },
  "kyc.activity_mismatch_registry": { en: "Activity type differs from records (informational).", hi: "गतिविधि प्रकार रिकॉर्ड से अलग है (केवल जानकारी)।" },
  "kyc.unrecognised_document": { en: "We could not read this document automatically. A team member will review it.", hi: "यह दस्तावेज़ अपने आप नहीं पढ़ा जा सका। हमारी टीम इसकी समीक्षा करेगी।" },

  "doc.gst_certificate": { en: "GST certificate", hi: "GST प्रमाणपत्र" },
  "doc.udyam_certificate": { en: "Udyam certificate", hi: "उद्यम प्रमाणपत्र" },
  "doc.signatory_id": { en: "Signatory ID", hi: "हस्ताक्षरकर्ता ID" },
  "doc.address_proof": { en: "Address proof (electricity bill)", hi: "पते का प्रमाण (बिजली बिल)" },
};

export function t(key: string, lang: Lang, params: Record<string, string | number> = {}): string {
  const m = MESSAGES[key]?.[lang] ?? MESSAGES[key]?.en ?? key;
  return m.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}
