import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MagicLinkProvider } from "@/components/MagicLinkDialog";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Deals from "@/pages/Deals";
import Preferences from "@/pages/Preferences";
import Notifications from "@/pages/Notifications";
import Admin from "@/pages/Admin";
import TopDeals from "@/pages/TopDeals";
import Blog from "@/pages/Blog";
import { PrivacyPolicy, AboutUs, Contact, TermsOfService, Disclaimer, SmsTerms } from "@/pages/Legal";
import NotificationsInfo from "@/pages/NotificationsInfo";
import DealPage from "@/pages/DealPage";
import BuyersGuide from "@/pages/BuyersGuide";
import Fanatics from "@/pages/Fanatics";
import AppIndex from "@/pages/AppIndex";
import TeamPage from "@/pages/TeamPage";
import TeamStatsLanding from "@/pages/TeamStatsLanding";
import AdminInvoices from "@/pages/AdminInvoices";
import AdminTaxonomyReview from "@/pages/AdminTaxonomyReview";
import DealBlastPage from "@/pages/DealBlastPage";
import { useAuth } from "@/hooks/use-auth";

// The deployment serves two custom domains:
//   - tssdeals.com (deals aggregator — the default app)
//   - tsteamstats.com (private team stat trackers)
// When the request comes in on tsteamstats.com we swap the home page so `/`
// shows a team directory instead of the deals UI. Every other route still
// works on both hosts (the team password gate at /team/:slug is the same).
function isTeamStatsHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h === "tsteamstats.com" || h === "www.tsteamstats.com";
}

function HomeGate() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isTeamStatsHost()) return <TeamStatsLanding />;

  if (isLoading) return <Landing />;
  if (!isAuthenticated) return <Deals />;
  return <AppIndex />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeGate} />
      <Route path="/team-stats" component={TeamStatsLanding} />
      <Route path="/admin/invoices" component={AdminInvoices} />

      {/* Logged-in app routes */}
      <Route path="/app" component={AppIndex} />
      <Route path="/app/deals" component={Deals} />
      <Route path="/app/top-deals/:slug" component={TopDeals} />
      <Route path="/app/top-deals" component={TopDeals} />
      <Route path="/app/preferences" component={Preferences} />
      <Route path="/app/notifications" component={Notifications} />
      <Route path="/app/blog/:slug" component={Blog} />
      <Route path="/app/blog" component={Blog} />
      <Route path="/app/fanatics" component={Fanatics} />
      <Route path="/app/admin/taxonomy-review" component={AdminTaxonomyReview} />
      <Route path="/app/admin" component={Admin} />

      {/* Buyer's Guide */}
      <Route path="/guides/:slug" component={BuyersGuide} />
      <Route path="/guides" component={BuyersGuide} />

      {/* Trust / legal pages */}
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/about" component={AboutUs} />
      <Route path="/contact" component={Contact} />
      <Route path="/terms" component={TermsOfService} />
      <Route path="/disclaimer" component={Disclaimer} />
      <Route path="/sms-terms" component={SmsTerms} />
      <Route path="/notifications" component={NotificationsInfo} />

      {/* SEO deal pages */}
      <Route path="/deals/:slug" component={DealPage} />
      <Route path="/deals" component={DealPage} />

      <Route path="/d/:slug" component={DealBlastPage} />

      {/* Private team stats (password-gated, hidden from nav) */}
      <Route path="/team/:slug" component={TeamPage} />

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MagicLinkProvider>
          <Toaster />
          <Router />
        </MagicLinkProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
