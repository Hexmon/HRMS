# Cross-Employer Identity Verification Options (India)

Research snapshot: 2026-11-09. Purpose: support product discovery, not approve a provider, legal interpretation, API integration, or product code change. Requirement: one person has one active company at a time; each employer supplies a new work email; transfer requires old and new HR approval (`owner-decisions.md`).

## What Each Check Can Prove

| Check | What it establishes | What it cannot establish | Cost/access finding |
| --- | --- | --- | --- |
| Work-email link | Control of the new employer's mailbox. | Same human as a prior account, legal identity, actual employment. | Uses existing application email flow; delivery has provider cost/limits. |
| Phone OTP | Control of a number at that time. | Unique or permanent person; numbers can be shared/reassigned. | No verified free SMS OTP service identified in this research. |
| Old-HR + new-HR transfer with person participation | Authorized company release/acceptance and a traceable link to an existing platform person record. | Unknown prior account if the person conceals it and neither HR can identify it. | Can be product workflow without third-party API; requires audit/dispute process. |
| UIDAI secure QR/offline XML, voluntary | Authenticity of a resident-shared signed identity document when the signature is verified, with photo/demographic review. | Employment status or active membership in another HRMS company; it is not a cross-company lookup API. | [UIDAI says its QR scanner is freely available](https://uidai.gov.in/images/DosandDon_ts_for_Offline_Verification_Seeking_entities.pdf); [offline XML/QR is consent-based](https://uidai.gov.in/en/aadhaar-paperless-offline-e-kyc). A free official scanner is not a free SaaS verification API/SDK. |
| UIDAI online Aadhaar authentication/e-KYC | Online identity response for an authorized requesting entity. | Employment status. | [AUA/KUA appointment and ASA connection are required; fees may apply](https://uidai.gov.in/hi/authentication-requesting-agency). Do not assume open or free access. UIDAI says Aadhaar number should not be used as a domain-specific identifier. |
| DigiLocker requester API | Consented access to authentic issued documents for an approved requester. | Universal employment history or automatic one-company enforcement. | [Employers can apply as requesters, subject to eligibility review](https://api.apisetu.gov.in/); [partner onboarding includes vetting, agreements and testing](https://www.digilocker.gov.in/web/implementation-model). No general free unrestricted API was verified. |

## Recommended Product Direction For Initial SMB Release

1. Use company work-email verification for account access and have HR verify the employment relationship with its existing hiring records. Treat this as company authorization, not legal-identity proof.
2. Assign an internal opaque `person_id` only after the person is linked by an approved process. Keep company employment, roles and work email as separate time-bounded records. Use that link to enforce one active company **for linked people**.
3. For a transfer, require the person to initiate/consent, then old HR to release and new HR to accept. Record effective dates and immutable decisions; revoke old sessions and retain old-company historical records. Define an exception path for an unreachable old employer before implementing.
4. Offer a voluntary, consent-based identity document check only if the product owner needs stronger assurance. Start with an HR-operated official scanner and minimal verification result; avoid storing raw Aadhaar numbers, QR/XML, photos or biometrics as the platform's person key. Obtain specialist legal/privacy review before integration. This recommendation follows UIDAI's [offline verification guidance](https://uidai.gov.in/en/aadhaar-paperless-offline-e-kyc) and [requesting-entity security guidance](https://uidai.gov.in/hi/authentication-requesting-agency).
5. State the guarantee honestly: with a different email and no stable verified cross-employer identifier or prior-account disclosure, the system cannot automatically prove that two signups are the same person. Manual review reduces risk but does not make duplicate humans impossible.

## Open Product Decisions

- What evidence should HR review: offer/employment record only, voluntary UIDAI-signed identity document, DigiLocker document, or an approved provider?
- What is the transfer exception when the old company is inactive, refuses, or cannot respond, and who arbitrates disputes?
- What minimal verification outcome may the platform retain, who can view it, and when is it deleted?
- Is the one-active-company rule an operational policy for the first release or a hard enrollment gate requiring higher-assurance identity integration?

No vendor capability, price, legal basis or permission is assumed from an SDK name or marketing page. Recheck official terms and current eligibility before procurement or implementation.
