import React, { useState } from 'react';
import BasicExample from './examples/BasicExample';
import NestedExample from './examples/NestedExample';
import ArrayExample from './examples/ArrayExample';
import ArraySingleValuesExample from './examples/ArraySingleValuesExample';
import ServerExample from './examples/ServerExample';
import PrefilledExample from './examples/PrefilledExample';
import ApiExample from './examples/ApiExample';
import UnhandledErrorExample from './examples/UnhandledErrorExample';

const tabs = [
  'Basic',
  'Nested',
  'Array - Object',
  'Array - Single Values',
  'Server',
  'Prefilled',
  'API',
  'Unhandled Error',
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
      className={`px-4 py-2 font-medium rounded-t-lg ${
        active
          ? 'bg-white text-blue-600 border-t border-x border-gray-200'
          : 'text-gray-500 hover:text-gray-700 bg-gray-50'
      }`}
    >
      {tab}
    </button>
  );
}

export default function ExampleTabs() {
  const [activeTab, setActiveTab] = useState<Tab>('Basic');

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
          <div className="border-b border-gray-200">
            <div className="flex">
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
            {activeTab === 'Unhandled Error' && <UnhandledErrorExample />}
          </div>
        </div>
      </div>
    </div>
  );
}
