import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import Index from './pages/Index';
import Trade from './pages/Trade';
import NotFound from './pages/NotFound';

const queryClient = new QueryClient();

interface AppProps {
    routerType?: 'browser' | 'memory';
    initialEntries?: string[];
}

const App = ({ routerType = 'browser', initialEntries }: AppProps) => {
    const Router = routerType === 'memory' ? MemoryRouter : BrowserRouter;

    return (
        <QueryClientProvider client={queryClient}>
            <TooltipProvider>
                <Sonner />
                <Router initialEntries={initialEntries}>
                    <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/trade" element={<Trade />} />
                        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </Router>
            </TooltipProvider>
        </QueryClientProvider>
    );
};

export default App;
