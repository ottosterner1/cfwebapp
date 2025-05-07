import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, Calendar, ClipboardList, TrendingUp, Award, LineChart } from 'lucide-react';

const sampleData = [
  { name: 'Jan', attendance: 85 },
  { name: 'Feb', attendance: 88 },
  { name: 'Mar', attendance: 92 },
  { name: 'Apr', attendance: 90 },
  { name: 'May', attendance: 95 },
];

const Index = () => {
  return (
    <div className="bg-white">
      {/* Fixed header/navigation */}
      <header className="fixed inset-x-0 top-0 z-50 bg-white shadow-sm">
        <nav className="mx-auto flex max-w-7xl items-center justify-between p-4 lg:px-8" aria-label="Global">
          <div className="flex lg:flex-1">
            <a href="" className="-m-1.5 p-1.5">
              <span className="text-2xl font-bold text-blue-600">CourtFlow</span>
            </a>
          </div>
          <div className="hidden md:flex gap-x-6">
            <a href="#features" className="text-sm font-semibold leading-6 text-gray-700 hover:text-blue-600">
              Features
            </a>
            <a href="#benefits" className="text-sm font-semibold leading-6 text-gray-700 hover:text-blue-600">
              Benefits
            </a>
            <a href="#testimonials" className="text-sm font-semibold leading-6 text-gray-700 hover:text-blue-600">
              Testimonials
            </a>
            <a href="#pricing" className="text-sm font-semibold leading-6 text-gray-700 hover:text-blue-600">
              Pricing
            </a>
          </div>
          <div className="flex gap-x-4">
            <a href="/login" className="text-sm font-semibold leading-6 text-gray-900 hover:text-blue-600">
              Log in
            </a>
            <a
              href="/signup"
              className="rounded-md bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Start Free Trial
            </a>
          </div>
        </nav>
      </header>

      {/* Hero section with split layout */}
      <div className="relative isolate pt-14">
        <div className="py-12 sm:py-20">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                  Streamline Your Tennis Coaching Program
                </h1>
                <p className="mt-6 text-lg leading-8 text-gray-600">
                  CourtFlow makes it easy for tennis coaches to manage players, track attendance, 
                  and generate professional reports so you can focus on what matters most - coaching.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row gap-4">
                  <a
                    href="/signup"
                    className="rounded-md bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    Start Free 14-Day Trial
                  </a>
                  <a 
                    href="#demo"
                    className="rounded-md border border-gray-300 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    Request Demo
                  </a>
                </div>
                <div className="mt-8">
                  <p className="text-sm text-gray-500">Trusted by 500+ tennis coaches worldwide</p>
                  <div className="mt-2 flex gap-6">
                    <img src="/api/placeholder/100/40" alt="Tennis Club Logo" className="h-10 grayscale opacity-70" />
                    <img src="/api/placeholder/100/40" alt="Tennis Club Logo" className="h-10 grayscale opacity-70" />
                    <img src="/api/placeholder/100/40" alt="Tennis Club Logo" className="h-10 grayscale opacity-70" />
                  </div>
                </div>
              </div>
              <div className="relative">
                <div className="rounded-xl bg-white shadow-xl ring-1 ring-gray-200 overflow-hidden">
                  <div className="bg-blue-600 text-white p-3 text-sm font-medium">
                    Player Attendance Dashboard
                  </div>
                  <div className="p-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sampleData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="attendance" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="absolute -bottom-6 -right-6 -z-10 h-full w-full rounded-xl bg-blue-100"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Before/After section */}
      <div className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center mb-12">
            <h2 className="text-base font-semibold leading-7 text-blue-600">Transform Your Coaching</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
              The easier way to manage your tennis program
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 mt-10">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">BEFORE COURTFLOW</h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 mr-3">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </span>
                  <span>Attendance tracked on paper or spreadsheets</span>
                </li>
                <li className="flex items-start">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 mr-3">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </span>
                  <span>Hours spent creating player reports manually</span>
                </li>
                <li className="flex items-start">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 mr-3">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </span>
                  <span>Difficult to track player progress over time</span>
                </li>
                <li className="flex items-start">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 mr-3">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </span>
                  <span>No centralized player database</span>
                </li>
              </ul>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">AFTER COURTFLOW</h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 mr-3">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span>Digital attendance tracking in seconds</span>
                </li>
                <li className="flex items-start">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 mr-3">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span>Generate professional reports with one click</span>
                </li>
                <li className="flex items-start">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 mr-3">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span>Visualize and track player progress over time</span>
                </li>
                <li className="flex items-start">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 mr-3">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span>Centralized database accessible anywhere</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Features section with icons */}
      <div id="features" className="py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center mb-16">
            <h2 className="text-base font-semibold leading-7 text-blue-600">Powerful Features</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
              Everything you need to manage your tennis program
            </p>
            <p className="mt-6 text-lg text-gray-600">
              From attendance tracking to performance analytics, CourtFlow gives you all the tools to run your tennis program efficiently.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="flex flex-col items-start">
              <div className="rounded-lg bg-blue-100 p-3 text-blue-600">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Player Management</h3>
              <p className="mt-2 text-gray-600">
                Maintain a database of all your players with contact details, skill levels, and attendance history.
              </p>
            </div>
            
            <div className="flex flex-col items-start">
              <div className="rounded-lg bg-blue-100 p-3 text-blue-600">
                <Calendar className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Attendance Tracking</h3>
              <p className="mt-2 text-gray-600">
                Take attendance digitally for every session with just a few taps, saving time and reducing errors.
              </p>
            </div>
            
            <div className="flex flex-col items-start">
              <div className="rounded-lg bg-blue-100 p-3 text-blue-600">
                <ClipboardList className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Report Generation</h3>
              <p className="mt-2 text-gray-600">
                Create professional player progress reports with customizable templates that reflect your coaching philosophy.
              </p>
            </div>
            
            <div className="flex flex-col items-start">
              <div className="rounded-lg bg-blue-100 p-3 text-blue-600">
                <LineChart className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Performance Analytics</h3>
              <p className="mt-2 text-gray-600">
                Visualize player progress and program performance with intuitive charts and analytics.
              </p>
            </div>
            
            <div className="flex flex-col items-start">
              <div className="rounded-lg bg-blue-100 p-3 text-blue-600">
                <Award className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">LTA Accreditation</h3>
              <p className="mt-2 text-gray-600">
                Easily meet Lawn Tennis Association requirements with standardized reporting and documentation.
              </p>
            </div>
            
            <div className="flex flex-col items-start">
              <div className="rounded-lg bg-blue-100 p-3 text-blue-600">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Program Growth</h3>
              <p className="mt-2 text-gray-600">
                Identify trends and opportunities to grow your tennis program with comprehensive insights.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Testimonials section */}
      <div id="testimonials" className="bg-blue-50 py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center mb-16">
            <h2 className="text-base font-semibold leading-7 text-blue-600">Testimonials</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
              Trusted by tennis coaches worldwide
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="flex items-center mb-4">
                <img src="/api/placeholder/40/40" alt="Coach" className="h-10 w-10 rounded-full" />
                <div className="ml-3">
                  <h4 className="text-sm font-semibold">Sarah Thompson</h4>
                  <p className="text-xs text-gray-500">Head Coach, Wimbledon Tennis Club</p>
                </div>
              </div>
              <p className="text-gray-600">
                "CourtFlow has transformed how we manage our tennis program. The time saved on administrative tasks means I can focus more on actual coaching."
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="flex items-center mb-4">
                <img src="/api/placeholder/40/40" alt="Coach" className="h-10 w-10 rounded-full" />
                <div className="ml-3">
                  <h4 className="text-sm font-semibold">James Rodriguez</h4>
                  <p className="text-xs text-gray-500">Director, Tennis Academy International</p>
                </div>
              </div>
              <p className="text-gray-600">
                "The reporting feature is fantastic. Parents love the professional reports we can now generate, and it's improved our retention rates significantly."
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="flex items-center mb-4">
                <img src="/api/placeholder/40/40" alt="Coach" className="h-10 w-10 rounded-full" />
                <div className="ml-3">
                  <h4 className="text-sm font-semibold">Emma Chen</h4>
                  <p className="text-xs text-gray-500">LTA Licensed Coach, Brighton Tennis</p>
                </div>
              </div>
              <p className="text-gray-600">
                "As a solo coach, CourtFlow has been a game-changer. I can manage everything from one place, and the analytics help me improve my program continuously."
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing section */}
      <div id="pricing" className="py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center mb-16">
            <h2 className="text-base font-semibold leading-7 text-blue-600">Pricing</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
              Simple, transparent pricing
            </p>
            <p className="mt-6 text-lg text-gray-600">
              Start with a 14-day free trial, no credit card required.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">Starter</h3>
              <p className="mt-2 text-gray-600 h-12">Perfect for individual coaches managing small groups.</p>
              <p className="mt-4">
                <span className="text-4xl font-bold text-gray-900">£29</span>
                <span className="text-gray-500">/month</span>
              </p>
              <ul className="mt-6 space-y-3">
                <li className="flex items-start">
                  <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Up to 50 players</span>
                </li>
                <li className="flex items-start">
                  <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Attendance tracking</span>
                </li>
                <li className="flex items-start">
                  <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Basic reporting</span>
                </li>
              </ul>
              <a
                href="/signup"
                className="mt-8 block w-full rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
              >
                Start Free Trial
              </a>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md border-2 border-blue-600 relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                Most Popular
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Professional</h3>
              <p className="mt-2 text-gray-600 h-12">Ideal for tennis clubs with multiple coaches and programs.</p>
              <p className="mt-4">
                <span className="text-4xl font-bold text-gray-900">£79</span>
                <span className="text-gray-500">/month</span>
              </p>
              <ul className="mt-6 space-y-3">
                <li className="flex items-start">
                  <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Up to 200 players</span>
                </li>
                <li className="flex items-start">
                  <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Advanced reporting</span>
                </li>
                <li className="flex items-start">
                  <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Performance analytics</span>
                </li>
                <li className="flex items-start">
                  <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Multiple coach accounts</span>
                </li>
              </ul>
              <a
                href="/signup"
                className="mt-8 block w-full rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
              >
                Start Free Trial
              </a>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">Enterprise</h3>
              <p className="mt-2 text-gray-600 h-12">For large tennis academies and multi-location organizations.</p>
              <p className="mt-4">
                <span className="text-4xl font-bold text-gray-900">£199</span>
                <span className="text-gray-500">/month</span>
              </p>
              <ul className="mt-6 space-y-3">
                <li className="flex items-start">
                  <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Unlimited players</span>
                </li>
                <li className="flex items-start">
                  <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Custom report templates</span>
                </li>
                <li className="flex items-start">
                  <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>API access</span>
                </li>
                <li className="flex items-start">
                  <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Priority support</span>
                </li>
              </ul>
              <a
                href="/contact"
                className="mt-8 block w-full rounded-md bg-gray-100 border border-gray-300 px-4 py-2 text-center text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-200"
              >
                Contact Sales
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* CTA section */}
      <div className="bg-white">
        <div className="mx-auto max-w-7xl py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="relative isolate overflow-hidden bg-blue-600 px-6 py-16 text-center shadow-2xl sm:rounded-3xl sm:px-16">
            <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to transform your tennis coaching?
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-blue-100">
              Join hundreds of tennis coaches already using CourtFlow to streamline their programs.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-6">
              <a
                href="/signup"
                className="rounded-md bg-white px-5 py-3 text-sm font-semibold text-blue-600 shadow-sm hover:bg-blue-50"
              >
                Start Free 14-Day Trial
              </a>
              <a href="/demo" className="text-sm font-semibold leading-6 text-white">
                Schedule a demo <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white">
        <div className="mx-auto max-w-7xl px-6 py-12 md:flex md:items-center md:justify-between lg:px-8">
          <div className="mb-6 md:mb-0">
            <a href="" className="text-2xl font-bold text-white">CourtFlow</a>
            <p className="mt-2 text-sm text-gray-400">Making tennis coaching management simple.</p>
          </div>
          
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <h3 className="text-sm font-semibold">Product</h3>
              <ul className="mt-4 space-y-2">
                <li><a href="#features" className="text-sm text-gray-400 hover:text-white">Features</a></li>
                <li><a href="#pricing" className="text-sm text-gray-400 hover:text-white">Pricing</a></li>
                <li><a href="/roadmap" className="text-sm text-gray-400 hover:text-white">Roadmap</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-sm font-semibold">Company</h3>
              <ul className="mt-4 space-y-2">
                <li><a href="/about" className="text-sm text-gray-400 hover:text-white">About</a></li>
                <li><a href="/blog" className="text-sm text-gray-400 hover:text-white">Blog</a></li>
                <li><a href="/contact" className="text-sm text-gray-400 hover:text-white">Contact</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-sm font-semibold">Legal</h3>
              <ul className="mt-4 space-y-2">
                <li><a href="/privacy" className="text-sm text-gray-400 hover:text-white">Privacy</a></li>
                <li><a href="/terms" className="text-sm text-gray-400 hover:text-white">Terms</a></li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="mx-auto max-w-7xl border-t border-gray-800 px-6 py-6">
          <p className="text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} CourtFlow. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;