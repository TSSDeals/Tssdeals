import Seo from "@/components/Seo";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

function LegalShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-mesh grain">
      <Seo title={`${title} | TwinSeam Deals`} description={description} />

      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/55 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <img
                src="/images/tss-logo.jpeg"
                alt="Twin Seam Sports"
                className="h-10 w-auto"
              />
              <div className="leading-tight">
                <div className="font-display text-lg font-bold">TwinSeam Deals</div>
              </div>
            </div>
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="link-back-home">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
        <div className="prose-legal space-y-6 text-sm leading-relaxed text-foreground/90">
          {children}
        </div>
      </main>

      <footer className="pb-10 pt-4">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="soft-divider h-px w-full" />
          <div className="mt-6 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between flex-wrap">
            <div>© {new Date().getFullYear()} TwinSeam Deals</div>
            <div className="flex items-center gap-4 flex-wrap">
              <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="footer-privacy">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="footer-terms">Terms of Service</Link>
              <Link href="/sms-terms" className="hover:text-foreground transition-colors" data-testid="footer-sms-terms">SMS Terms</Link>
              <Link href="/about" className="hover:text-foreground transition-colors" data-testid="footer-about">About</Link>
              <Link href="/contact" className="hover:text-foreground transition-colors" data-testid="footer-contact">Contact</Link>
              <Link href="/disclaimer" className="hover:text-foreground transition-colors" data-testid="footer-disclaimer">Disclaimer</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalShell
      title="Privacy Policy"
      description="Learn how TwinSeam Deals collects, uses, and protects your personal information."
    >
      <Section title="Introduction">
        <p>
          TwinSeam Deals ("we," "us," or "our") operates the tssdeals.com website (the "Service").
          This Privacy Policy explains how we collect, use, disclose, and safeguard your information
          when you visit our website and use our services. Please read this policy carefully. By using
          the Service, you agree to the collection and use of information in accordance with this policy.
        </p>
      </Section>

      <Section title="Information We Collect">
        <p>We collect information in the following ways:</p>
        <ul className="list-disc pl-6 space-y-2 mt-2">
          <li>
            <strong>Account Information:</strong> When you sign in using Replit authentication, we receive
            your name, email address, and profile image. We do not store passwords — authentication is
            handled securely by our third-party identity provider.
          </li>
          <li>
            <strong>Preferences:</strong> We store your selected sports, equipment types, condition
            preferences, and notification settings so we can personalize your deal feed.
          </li>
          <li>
            <strong>Usage Data:</strong> We may collect information about how you interact with the
            Service, including pages visited, features used, and timestamps.
          </li>
          <li>
            <strong>Push Notification Tokens:</strong> If you opt in to push notifications, we store
            your browser push subscription endpoint to deliver deal alerts.
          </li>
          <li>
            <strong>Phone Number:</strong> If you opt in to SMS notifications, we collect and store
            your mobile phone number to send deal alerts and price alert notifications via text message.
            Your phone number is used solely for delivering SMS notifications you have requested.
          </li>
        </ul>
      </Section>

      <Section title="SMS Messaging Privacy">
        <p>
          When you opt in to receive SMS messages from TSSDeals (Twin Seam Sports), we collect your
          mobile phone number and your consent to send you recurring automated promotional and personalized
          deal alert text messages, including price drop alerts, new deal alerts, and price target
          notifications. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to
          unsubscribe. Reply HELP for help. Consent to receive SMS messages is not a condition of purchase.
        </p>
        <p className="mt-3">
          We use your mobile phone number only to send the SMS messages you requested and to manage your
          subscription preferences. Mobile information will not be shared with third parties or affiliates
          for marketing or promotional purposes. Text messaging originator opt-in data and consent will not
          be shared with any third parties, excluding aggregators and providers of the text message services
          necessary to deliver the messages.
        </p>
        <p className="mt-3 font-semibold">
          Mobile information will not be shared with third parties or affiliates for marketing or promotional purposes.
        </p>
        <p className="mt-3">
          You may opt out of SMS messages at any time by replying STOP to any message. For help, reply
          HELP or contact{" "}
          <a href="mailto:tssdeals@twinseamsports.com" className="text-primary underline">tssdeals@twinseamsports.com</a>.
        </p>
      </Section>

      <Section title="How We Use Your Information">
        <ul className="list-disc pl-6 space-y-2">
          <li>To provide and maintain the Service, including personalized deal feeds</li>
          <li>To send push notifications about deals matching your preferences</li>
          <li>To send SMS text message alerts about deals and price drops (if opted in)</li>
          <li>To improve our Service and develop new features</li>
          <li>To communicate with you about Service-related matters</li>
          <li>To detect and prevent fraud or abuse</li>
        </ul>
      </Section>

      <Section title="Third-Party Services">
        <p>We work with the following third-party services:</p>
        <ul className="list-disc pl-6 space-y-2 mt-2">
          <li>
            <strong>Replit Auth:</strong> Provides secure authentication via OpenID Connect (OIDC).
          </li>
          <li>
            <strong>Retailer APIs (eBay, CJ Affiliate, Shopify, SidelineSwap):</strong> We fetch
            product listings and pricing data from various retailers. We do not share your personal
            information with these services.
          </li>
          <li>
            <strong>Google AdSense:</strong> We may display advertisements through Google AdSense.
            Google may use cookies and similar technologies to serve ads based on your prior visits.
            You can opt out of personalized advertising at{" "}
            <a
              href="https://www.google.com/settings/ads"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Google Ads Settings
            </a>.
          </li>
        </ul>
      </Section>

      <Section title="Cookies and Tracking">
        <p>
          We use cookies and similar tracking technologies to maintain your session and preferences.
          Third-party services like Google AdSense may also set cookies. You can instruct your browser
          to refuse cookies, though some features of the Service may not function properly without them.
        </p>
      </Section>

      <Section title="Data Security">
        <p>
          We implement industry-standard security measures to protect your information. However, no
          method of transmission over the Internet or electronic storage is 100% secure, and we cannot
          guarantee absolute security.
        </p>
      </Section>

      <Section title="Data Retention">
        <p>
          We retain your personal information for as long as your account is active or as needed to
          provide the Service. You may request deletion of your account and associated data by
          contacting us.
        </p>
      </Section>

      <Section title="Children's Privacy">
        <p>
          The Service is not directed to individuals under the age of 13. We do not knowingly collect
          personal information from children under 13. If we discover that a child under 13 has provided
          us with personal information, we will promptly delete it.
        </p>
      </Section>

      <Section title="Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. We will notify you of any changes by
          posting the new policy on this page and updating the "Last updated" date.
        </p>
      </Section>

      <Section title="Contact Us">
        <p>
          If you have questions about this Privacy Policy, please visit our{" "}
          <Link href="/contact" className="text-primary underline">Contact page</Link> or email us at{" "}
          <a href="mailto:tssdeals@twinseamsports.com" className="text-primary underline">tssdeals@twinseamsports.com</a>.
        </p>
      </Section>
    </LegalShell>
  );
}

export function AboutUs() {
  return (
    <LegalShell
      title="About TwinSeam Deals"
      description="Learn about TwinSeam Deals and Twin Seam Sports — our mission to help athletes find quality gear at great prices."
    >
      <Section title="Our Mission">
        <p>
          TwinSeam Deals was created by{" "}
          <a href="https://www.twinseamsports.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            Twin Seam Sports
          </a>{" "}
          with a simple goal: help athletes, coaches, and parents find quality sporting goods at
          significant discounts — typically around 50% off manufacturer retail prices.
        </p>
        <p className="mt-3">
          We believe everyone deserves access to great gear without overpaying. Whether you're outfitting
          a Little League team, upgrading your golf clubs, or looking for the perfect pair of cleats,
          TwinSeam Deals aggregates the best prices from trusted retailers across the web.
        </p>
      </Section>

      <Section title="How It Works">
        <p>
          Our platform scans dozens of sporting goods retailers, marketplaces, and manufacturer stores
          to find deals with verified discounts. We use manufacturer MSRP data to calculate accurate
          discount percentages, so you can trust the savings you see.
        </p>
        <ul className="list-disc pl-6 space-y-2 mt-3">
          <li>
            <strong>Verified Discounts:</strong> We compare prices against manufacturer-verified MSRP
            when available, so you know the discount is real.
          </li>
          <li>
            <strong>Multiple Sources:</strong> We aggregate deals from eBay, major retailers via CJ
            Affiliate, SidelineSwap, and Twin Seam Sports' own inventory.
          </li>
          <li>
            <strong>Personalized Feeds:</strong> Choose your sports and equipment types, and we'll
            prioritize deals that matter to you.
          </li>
          <li>
            <strong>Push Notifications:</strong> Get alerted about hot deals four times daily at
            8am, 12pm, 4pm, and 8pm ET.
          </li>
        </ul>
      </Section>

      <Section title="About Twin Seam Sports">
        <p>
          Twin Seam Sports is a sporting goods retailer specializing in baseball, softball, and other
          athletic equipment. We carry a curated selection of new and pre-owned gear, and our own
          inventory is prominently featured on TwinSeam Deals whenever our pricing is competitive.
        </p>
        <p className="mt-3">
          Our core message: "Twin Seam Sports highlights our best deals and brings you the best deals
          around the web. Because even if you don't get your gear from us — we want to make sure you
          get great gear at a great price."
        </p>
      </Section>

      <Section title="Our Blog">
        <p>
          The{" "}
          <Link href="/app/blog" className="text-primary underline">Twin Seam Blog & Product Reviews</Link>{" "}
          section features expert gear guides, product reviews, and maintenance tips from our team.
          We're committed to helping you get the most out of your equipment, whether you bought it
          from us or found it through our deal feed.
        </p>
      </Section>

      <Section title="Get in Touch">
        <p>
          Questions, suggestions, or partnership inquiries? Visit our{" "}
          <Link href="/contact" className="text-primary underline">Contact page</Link> or email{" "}
          <a href="mailto:tssdeals@twinseamsports.com" className="text-primary underline">tssdeals@twinseamsports.com</a>.
        </p>
      </Section>
    </LegalShell>
  );
}

export function Contact() {
  return (
    <LegalShell
      title="Contact Us"
      description="Get in touch with the TwinSeam Deals and Twin Seam Sports team."
    >
      <Section title="We'd Love to Hear From You">
        <p>
          Whether you have a question about a deal, a suggestion for improving the site, or want to
          explore a partnership, we're here to help. Here are the best ways to reach us:
        </p>
      </Section>

      <Section title="Email">
        <p>
          For general inquiries, feedback, or support:
        </p>
        <p className="mt-2">
          <a
            href="mailto:tssdeals@twinseamsports.com"
            className="text-primary underline font-semibold"
            data-testid="link-contact-email"
          >
            tssdeals@twinseamsports.com
          </a>
        </p>
        <p className="mt-2 text-muted-foreground">
          We aim to respond within 1–2 business days.
        </p>
      </Section>

      <Section title="Twin Seam Sports Store">
        <p>
          Visit our main store for products, blog articles, and more:
        </p>
        <p className="mt-2">
          <a
            href="https://www.twinseamsports.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline font-semibold"
            data-testid="link-contact-store"
          >
            www.twinseamsports.com
          </a>
        </p>
      </Section>

      <Section title="Retailer & Partnership Inquiries">
        <p>
          If you're a retailer, brand, or affiliate network interested in having your deals featured
          on TwinSeam Deals, please reach out to us at{" "}
          <a href="mailto:tssdeals@twinseamsports.com" className="text-primary underline">
            tssdeals@twinseamsports.com
          </a>{" "}
          with "Partnership" in the subject line.
        </p>
      </Section>

      <Section title="Report an Issue">
        <p>
          Found a broken link, incorrect pricing, or a technical issue? Please let us know at{" "}
          <a href="mailto:tssdeals@twinseamsports.com" className="text-primary underline">
            tssdeals@twinseamsports.com
          </a>{" "}
          with details about what you encountered, and we'll look into it promptly.
        </p>
      </Section>
    </LegalShell>
  );
}

export function TermsOfService() {
  return (
    <LegalShell
      title="Terms of Service"
      description="Read the terms and conditions governing your use of TwinSeam Deals."
    >
      <Section title="Acceptance of Terms">
        <p>
          By accessing and using TwinSeam Deals ("the Service"), you agree to be bound by these Terms
          of Service. If you do not agree with any part of these terms, you may not use the Service.
        </p>
      </Section>

      <Section title="Description of Service">
        <p>
          TwinSeam Deals is a sporting goods deal aggregation platform that displays product listings
          and pricing information from various third-party retailers and marketplaces. We do not sell
          products directly through this Service (except for Twin Seam Sports' own inventory).
          Purchases are completed on the respective retailer's website.
        </p>
      </Section>

      <Section title="User Accounts">
        <ul className="list-disc pl-6 space-y-2">
          <li>You must sign in using Replit authentication to access personalized features.</li>
          <li>You are responsible for maintaining the confidentiality of your account.</li>
          <li>You agree to provide accurate information and to update it as necessary.</li>
          <li>We reserve the right to suspend or terminate accounts that violate these terms.</li>
        </ul>
      </Section>

      <Section title="Product Listings and Pricing">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            Product information, pricing, and availability are provided by third-party retailers
            and may change without notice.
          </li>
          <li>
            We make reasonable efforts to display accurate pricing and discount information, but
            we cannot guarantee the accuracy of all listings.
          </li>
          <li>
            MSRP (Manufacturer's Suggested Retail Price) data is sourced from manufacturers when
            available and may not reflect current retail pricing at all stores.
          </li>
          <li>
            Discount percentages are calculated based on available MSRP data and the listed sale price.
          </li>
        </ul>
      </Section>

      <Section title="Intellectual Property">
        <p>
          The Service, its original content, features, and functionality are owned by Twin Seam Sports
          and are protected by copyright, trademark, and other intellectual property laws. Product
          names, logos, and images belong to their respective owners.
        </p>
      </Section>

      <Section title="SMS Terms & Conditions">
        <p>
          By opting in through{" "}
          <a href="https://www.tssdeals.com/notifications" className="text-primary underline">https://www.tssdeals.com/notifications</a>,
          you agree to receive recurring automated promotional and personalized deal alert text messages
          from TSSDeals (Twin Seam Sports) at the mobile number you provide. These messages may include
          price drop alerts, new deal alerts, price target notifications, and subscription-related messages.
          Message frequency varies. Msg &amp; data rates may apply.
        </p>
        <p className="mt-3">
          You can opt out at any time by replying STOP to any message. For help, reply HELP or contact{" "}
          <a href="mailto:tssdeals@twinseamsports.com" className="text-primary underline">tssdeals@twinseamsports.com</a>.
          Consent to receive SMS messages is not a condition of purchase. Wireless carriers are not liable
          for delayed or undelivered messages.
        </p>
      </Section>

      <Section title="Prohibited Uses">
        <p>You agree not to:</p>
        <ul className="list-disc pl-6 space-y-2 mt-2">
          <li>Use the Service for any unlawful purpose</li>
          <li>Scrape, data mine, or automatically collect data from the Service</li>
          <li>Attempt to gain unauthorized access to any part of the Service</li>
          <li>Interfere with or disrupt the Service or its infrastructure</li>
          <li>Use the Service to transmit spam, malware, or harmful content</li>
        </ul>
      </Section>

      <Section title="Limitation of Liability">
        <p>
          TwinSeam Deals and Twin Seam Sports shall not be liable for any indirect, incidental,
          special, consequential, or punitive damages resulting from your use of or inability to
          use the Service. We are not responsible for any transactions you complete on third-party
          retailer websites.
        </p>
      </Section>

      <Section title="Third-Party Links">
        <p>
          The Service contains links to third-party websites and retailers. We are not responsible
          for the content, privacy policies, or practices of these third-party sites. Your interaction
          with linked sites is governed by their respective terms and policies.
        </p>
      </Section>

      <Section title="Modifications">
        <p>
          We reserve the right to modify or discontinue the Service at any time without notice. We
          may also revise these Terms of Service from time to time. Continued use of the Service
          after changes constitutes acceptance of the modified terms.
        </p>
      </Section>

      <Section title="Governing Law">
        <p>
          These Terms shall be governed by and construed in accordance with the laws of the United
          States, without regard to conflict of law principles.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          For questions about these Terms, please visit our{" "}
          <Link href="/contact" className="text-primary underline">Contact page</Link> or email{" "}
          <a href="mailto:tssdeals@twinseamsports.com" className="text-primary underline">tssdeals@twinseamsports.com</a>.
        </p>
      </Section>
    </LegalShell>
  );
}

export function Disclaimer() {
  return (
    <LegalShell
      title="Disclaimer"
      description="Important disclosures about affiliate relationships, pricing accuracy, and content on TwinSeam Deals."
    >
      <Section title="General Disclaimer">
        <p>
          The information provided on TwinSeam Deals is for general informational purposes only.
          While we strive to keep the information accurate and up to date, we make no representations
          or warranties of any kind, express or implied, about the completeness, accuracy, reliability,
          or suitability of the information, products, or services found on or through the Service.
        </p>
      </Section>

      <Section title="Affiliate Disclosure">
        <p>
          TwinSeam Deals participates in affiliate marketing programs. This means we may earn
          commissions when you click links to retailer websites and make purchases. These affiliate
          relationships include, but are not limited to:
        </p>
        <ul className="list-disc pl-6 space-y-2 mt-2">
          <li>
            <strong>CJ Affiliate:</strong> We participate in the CJ Affiliate network, which provides
            access to product listings from various sporting goods retailers.
          </li>
          <li>
            <strong>eBay Partner Network:</strong> Product links to eBay listings may generate
            referral commissions.
          </li>
          <li>
            <strong>Twin Seam Sports:</strong> Deals from our own store (twinseamsports.com) are
            prominently featured when our pricing is competitive. These are direct sales, not affiliate
            transactions.
          </li>
        </ul>
        <p className="mt-3">
          Affiliate commissions do not increase the price you pay for any product. Our recommendations
          and deal rankings are based on discount percentage and product quality, not on commission rates.
        </p>
      </Section>

      <Section title="Pricing Accuracy">
        <p>
          Product prices and availability are sourced from third-party retailers and are subject to
          change at any time. While we update pricing data regularly, there may be delays between
          when a price changes and when our platform reflects that change.
        </p>
        <p className="mt-3">
          MSRP (Manufacturer's Suggested Retail Price) values are sourced from manufacturer data when
          available. In some cases, MSRP may not reflect the current market value or may be based on
          the original retail price at launch. Discount percentages are estimates and should be verified
          on the retailer's website before making a purchase.
        </p>
      </Section>

      <Section title="Product Condition">
        <p>
          Deals on TwinSeam Deals may include new, pre-owned, refurbished, or open-box items. Product
          condition is displayed when this information is available from the retailer. Always verify
          the condition and return policy on the retailer's website before purchasing.
        </p>
      </Section>

      <Section title="Blog Content">
        <p>
          Blog articles and product reviews published on TwinSeam Deals are provided for informational
          and educational purposes. Product recommendations reflect our opinions and experiences.
          Individual results may vary. Always research products independently before making purchase
          decisions.
        </p>
      </Section>

      <Section title="External Links">
        <p>
          TwinSeam Deals contains links to external websites operated by third-party retailers and
          marketplaces. We have no control over the content, privacy practices, or terms of service
          of these external sites. Inclusion of any linked site does not imply endorsement beyond
          the specific deal being presented.
        </p>
      </Section>

      <Section title="No Professional Advice">
        <p>
          Nothing on this website constitutes professional advice regarding athletic equipment
          selection, safety, or performance. Consult with qualified professionals and follow
          manufacturer guidelines when using sporting goods equipment.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          If you have questions about this Disclaimer, please visit our{" "}
          <Link href="/contact" className="text-primary underline">Contact page</Link> or email{" "}
          <a href="mailto:tssdeals@twinseamsports.com" className="text-primary underline">tssdeals@twinseamsports.com</a>.
        </p>
      </Section>
    </LegalShell>
  );
}

export function SmsTerms() {
  return (
    <LegalShell
      title="SMS Terms & Conditions"
      description="Terms and conditions for TSSDeals SMS deal alert and price notification services."
    >
      <Section title="Program Description">
        <p>
          TSSDeals (operated by Twin Seam Sports, Maryville, TN) offers an optional SMS messaging
          program with two separate, independent consent categories. You may opt in to either category
          on its own, or to both:
        </p>
        <ul className="list-disc pl-6 space-y-2 mt-2">
          <li>
            <strong>Marketing Messages</strong> — recurring automated promotional texts including
            promotions, coupons, special offers, featured deals, and scheduled new-deal announcements
            in your preferred sports categories.
          </li>
          <li>
            <strong>Deal Alerts &amp; Account Notifications (Non-Marketing)</strong> — automated
            non-marketing texts such as price-drop and price-target alerts on items you choose to
            track, account notifications, and the one-time subscription confirmation sent immediately
            after opt-in.
          </li>
        </ul>
      </Section>

      <Section title="How to Opt In">
        <p>
          To receive SMS messages, visit{" "}
          <Link href="/notifications" className="text-primary underline">tssdeals.com/notifications</Link>,
          enter your US mobile phone number, and check the consent box for each category you want to
          receive. The two consent boxes (Marketing Messages and Deal Alerts &amp; Account
          Notifications) are separate and optional, and neither is pre-checked — you must actively
          select at least one. After submitting the form, you will receive a confirmation text message
          for the category you selected.
        </p>
      </Section>

      <Section title="Message Frequency">
        <p>
          Message frequency varies. You may receive up to 4 scheduled deal alert messages per day
          (sent at approximately 8am, 12pm, 4pm, and 8pm ET), plus individual price drop and price
          target notifications triggered by your tracked items. You will not receive messages unrelated
          to sporting goods deals or your price alerts.
        </p>
      </Section>

      <Section title="Rates">
        <p>
          Message and data rates may apply. Standard carrier messaging rates may apply depending on
          your plan. TSSDeals does not charge for SMS messages. Check with your wireless carrier for
          details on your messaging plan.
        </p>
        <p className="mt-2">Carriers are not liable for delayed or undelivered messages.</p>
      </Section>

      <Section title="How to Opt Out">
        <p>
          You may cancel your SMS subscription at any time by replying <strong>STOP</strong> to any
          message from TSSDeals. After texting STOP, you will receive a one-time confirmation that
          your subscription has been cancelled and you will no longer receive messages. You can
          also disable SMS notifications in your{" "}
          <Link href="/app/preferences" className="text-primary underline">Preferences</Link> page.
        </p>
        <p className="mt-2">
          To re-subscribe after opting out, visit{" "}
          <Link href="/notifications" className="text-primary underline">tssdeals.com/notifications</Link>{" "}
          and complete the opt-in form again.
        </p>
      </Section>

      <Section title="How to Get Help">
        <p>
          If you need help with your SMS subscription, reply <strong>HELP</strong> to any message.
          You can also contact us at:
        </p>
        <ul className="list-disc pl-6 space-y-2 mt-2">
          <li>Email: <a href="mailto:tssdeals@twinseamsports.com" className="text-primary underline">tssdeals@twinseamsports.com</a></li>
          <li>Phone: (934) CALL-TSS (225-5877)</li>
        </ul>
      </Section>

      <Section title="Consent Not Required for Purchase">
        <p>
          Consent to receive SMS messages is not required as a condition of any purchase or use of the
          TSSDeals website. You may browse deals and use all features of the website without opting in
          to SMS notifications.
        </p>
      </Section>

      <Section title="No Sharing of Mobile Information">
        <p className="p-3 rounded-lg bg-muted/60 border border-border font-semibold text-foreground">
          Mobile information will not be shared with third parties or affiliates for marketing or
          promotional purposes. All other categories exclude text messaging originator opt-in data
          and consent; this information will not be shared with any third parties.
        </p>
        <p className="mt-3">
          Your phone number is transmitted to Twilio solely for message delivery. See{" "}
          <a href="https://www.twilio.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            Twilio's Privacy Policy
          </a>{" "}
          for more information on how Twilio handles your data.
        </p>
      </Section>

      <Section title="Supported Carriers">
        <p>
          TSSDeals SMS is supported on all major US carriers including AT&amp;T, Verizon, T-Mobile,
          Sprint, Boost Mobile, Cricket, and others. Carrier support may vary.
        </p>
      </Section>

      <Section title="Changes to This Program">
        <p>
          TSSDeals reserves the right to modify or discontinue the SMS program at any time. We will
          notify active subscribers of any material changes.
        </p>
      </Section>

      <Section title="Related Policies">
        <p>
          For more information, see our{" "}
          <Link href="/privacy" className="text-primary underline">Privacy Policy</Link> and{" "}
          <Link href="/terms" className="text-primary underline">Terms of Service</Link>.
        </p>
      </Section>
    </LegalShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold mb-3">{title}</h2>
      {children}
    </section>
  );
}
