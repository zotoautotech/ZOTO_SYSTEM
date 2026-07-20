import { LegalPage } from "./LegalPage";

export function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="18 July 2026">
      <p>
        This Privacy Policy explains how ZOTO AUTOTECH PRIVATE LIMITED ("we," "us," or "our") collects,
        uses, and protects information when you use ZOTO Sales CRR, our internal order-to-delivery
        management system.
      </p>
      <h3>Information we collect</h3>
      <p>
        We collect information you provide directly, such as your name and work email when you sign in,
        and business data you enter while using the system — customer records, orders, dispatch details,
        and related operational data.
      </p>
      <h3>How we use it</h3>
      <p>
        Information is used solely to operate ZOTO Sales CRR for authorized ZOTO staff and partners —
        tracking orders, managing customers, and coordinating dispatch and delivery. We do not sell or
        share this data with third parties outside what's required to run the system.
      </p>
      <h3>Data storage</h3>
      <p>
        Data is stored in Google Sheets accessed via a secured service account, with access restricted to
        authenticated ZOTO users.
      </p>
      <h3>Contact</h3>
      <p>For questions about this policy, contact operations@theairtrap.com.</p>
      <p style={{ color: "#8a8d98", fontStyle: "italic" }}>
        This is a placeholder policy — replace with ZOTO's finalized legal text.
      </p>
    </LegalPage>
  );
}
