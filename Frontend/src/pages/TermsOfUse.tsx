import { LegalPage } from "./LegalPage";

export function TermsOfUse() {
  return (
    <LegalPage title="Terms of Use" lastUpdated="18 July 2026">
      <p>
        By accessing and using ZOTO Sales CRR, you agree to be bound by these Terms of Use, set by ZOTO
        AUTOTECH PRIVATE LIMITED.
      </p>
      <h3>Authorized use</h3>
      <p>
        ZOTO Sales CRR is an internal system for ZOTO staff and authorized partners to manage orders,
        dispatch, and delivery. Access is limited to accounts issued by ZOTO administrators.
      </p>
      <h3>User responsibilities</h3>
      <p>
        You are responsible for keeping your login credentials secure and for the accuracy of data you
        enter into the system.
      </p>
      <h3>Availability</h3>
      <p>
        We aim for high availability but do not guarantee uninterrupted access. The system may be
        unavailable during maintenance or due to technical issues.
      </p>
      <h3>Changes to these terms</h3>
      <p>We may update these terms from time to time. Continued use after changes constitutes acceptance.</p>
      <p style={{ color: "#8a8d98", fontStyle: "italic" }}>
        This is a placeholder terms page — replace with ZOTO's finalized legal text.
      </p>
    </LegalPage>
  );
}
