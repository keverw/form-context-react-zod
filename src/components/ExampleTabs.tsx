import { useState, useRef, useEffect } from 'react';
import BasicExample from './examples/BasicExample';
import NestedExample from './examples/NestedExample';
import ArrayExample from './examples/ArrayExample';
import ArraySingleValuesExample from './examples/ArraySingleValuesExample';
import ServerExample from './examples/ServerExample';
import PrefilledExample from './examples/PrefilledExample';
import ApiExample from './examples/ApiExample';
import UnhandledErrorExample from './examples/UnhandledErrorExample';
import UncaughtErrorExample from './examples/UncaughtErrorExample';
import MultipleChildrenExample from './examples/MultipleChildrenExample';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const tabs = [
  'Basic',
  'Nested',
  'Array - Object',
  'Array - Single Values',
  'Server',
  'Prefilled',
  'API',
  'Multiple Children',
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
            {activeTab === 'Prefilled' && <PrefilledExample />}
            {activeTab === 'API' && <ApiExample />}
            {activeTab === 'Multiple Children' && <MultipleChildrenExample />}
            {activeTab === 'Unhandled Error' && <UnhandledErrorExample />}
            {activeTab === 'Uncaught Error' && <UncaughtErrorExample />}
          </div>
        </div>
      </div>
    </div>
  );
}
