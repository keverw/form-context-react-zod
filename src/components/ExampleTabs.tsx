import { useState, useRef, useEffect } from 'react';
import BasicExample from './examples/BasicExample';
import NestedExample from './examples/NestedExample';
import ArrayExample from './examples/ArrayExample';
import ArraySingleValuesExample from './examples/ArraySingleValuesExample';
import ServerExample from './examples/ServerExample';
import ClientSubmissionErrorExample from './examples/ClientSubmissionErrorExample';
import PrefilledExample from './examples/PrefilledExample';
import ApiExample from './examples/ApiExample';
import UnhandledErrorExample from './examples/UnhandledErrorExample';
import UncaughtErrorExample from './examples/UncaughtErrorExample';
import MultipleChildrenExample from './examples/MultipleChildrenExample';
import FormTagExample from './examples/FormTagExample';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const tabs = [
  'Basic',
  'Nested',
  'Array - Object',
  'Array - Single Values',
  'Server',
  'Client Submission Error',
  'Prefilled',
  'API',
  'Multiple Children',
  'Form Tag',
  'Unhandled Error',
  'Uncaught Error',
] as const;
type Tab = (typeof tabs)[number];

function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: Tab;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-3 text-sm font-medium rounded-t-lg whitespace-nowrap transition-all ${
        active
          ? 'bg-white text-blue-600 border-t-2 border-x border-b-0 border-t-blue-500 border-x-gray-200 shadow-sm font-semibold'
          : 'text-gray-600 hover:text-blue-500 bg-gray-50 hover:bg-gray-100 border border-transparent hover:border-gray-200'
      }`}
    >
      {tab}
    </button>
  );
}

export default function ExampleTabs() {
  const [activeTab, setActiveTab] = useState<Tab>('Basic');
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  // Check if scroll arrows should be visible
  const checkScrollPosition = () => {
    if (!tabsContainerRef.current) return;

    const { scrollLeft, scrollWidth, clientWidth } = tabsContainerRef.current;
    setShowLeftArrow(scrollLeft > 0);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1); // -1 for rounding errors
  };

  // Scroll the tabs container
  const scrollTabs = (direction: 'left' | 'right') => {
    if (!tabsContainerRef.current) return;

    const scrollAmount = direction === 'left' ? -200 : 200;
    tabsContainerRef.current.scrollBy({
      left: scrollAmount,
      behavior: 'smooth',
    });
  };

  // Initialize and set up scroll event listener
  useEffect(() => {
    const tabsContainer = tabsContainerRef.current;
    if (tabsContainer) {
      checkScrollPosition();
      tabsContainer.addEventListener('scroll', checkScrollPosition);
      window.addEventListener('resize', checkScrollPosition);
    }

    return () => {
      if (tabsContainer) {
        tabsContainer.removeEventListener('scroll', checkScrollPosition);
        window.removeEventListener('resize', checkScrollPosition);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Form Library Examples
          </h1>
          <p className="text-gray-600">
            Explore different form patterns and features
          </p>
          <div className="mt-3">
            <a
              href="https://github.com/keverw/form-context-react-zod"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
              View on GitHub
            </a>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="border-b border-gray-200 relative">
            {/* Left scroll arrow */}
            {showLeftArrow && (
              <button
                onClick={() => scrollTabs('left')}
                className="absolute left-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-r from-white via-white to-transparent flex items-center justify-center"
                aria-label="Scroll left"
              >
                <ChevronLeft size={18} className="text-gray-600" />
              </button>
            )}

            {/* Right scroll arrow */}
            {showRightArrow && (
              <button
                onClick={() => scrollTabs('right')}
                className="absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-white via-white to-transparent flex items-center justify-center"
                aria-label="Scroll right"
              >
                <ChevronRight size={18} className="text-gray-600" />
              </button>
            )}

            {/* Tabs container */}
            <div
              ref={tabsContainerRef}
              className="overflow-x-auto px-2 scroll-smooth scrollbar-thin"
              style={{
                scrollbarWidth: 'thin',
                msOverflowStyle: 'none',
              }}
            >
              <div className="flex space-x-2 py-3 min-w-max">
                {tabs.map((tab) => (
                  <TabButton
                    key={tab}
                    tab={tab}
                    active={activeTab === tab}
                    onClick={() => setActiveTab(tab)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="p-6">
            {activeTab === 'Basic' && <BasicExample />}
            {activeTab === 'Nested' && <NestedExample />}
            {activeTab === 'Array - Object' && <ArrayExample />}
            {activeTab === 'Array - Single Values' && (
              <ArraySingleValuesExample />
            )}
            {activeTab === 'Server' && <ServerExample />}
            {activeTab === 'Client Submission Error' && (
              <ClientSubmissionErrorExample />
            )}
            {activeTab === 'Prefilled' && <PrefilledExample />}
            {activeTab === 'API' && <ApiExample />}
            {activeTab === 'Multiple Children' && <MultipleChildrenExample />}
            {activeTab === 'Form Tag' && <FormTagExample />}
            {activeTab === 'Unhandled Error' && <UnhandledErrorExample />}
            {activeTab === 'Uncaught Error' && <UncaughtErrorExample />}
          </div>
        </div>
      </div>
    </div>
  );
}
