import React from 'react';
import { Bookmark, Search, Folder, ExternalLink } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[500px]">
        
        {/* Landing Info */}
        <div className="p-12 flex-1 flex flex-col justify-center">
          <div className="w-12 h-12 bg-amber-500 rounded-lg flex items-center justify-center mb-6 text-white shadow-lg shadow-amber-500/30">
            <Bookmark size={24} />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">Save smarter. Find faster.</h1>
          <p className="text-slate-600 mb-8">
            The browser extension that auto-categorizes your bookmarks using AI, so you never lose a link again.
          </p>
          <button className="bg-slate-900 text-white px-6 py-3 rounded-lg font-bold hover:bg-slate-800 transition w-fit">
            Add to Chrome - Free
          </button>
        </div>

        {/* Extension UI Sim */}
        <div className="bg-slate-50 p-8 flex-1 border-l border-slate-200 flex items-center justify-center relative">
          <div className="bg-white w-64 rounded-lg shadow-xl border border-slate-300 overflow-hidden absolute top-10 right-10 rotate-[-5deg]">
             <div className="bg-amber-500 p-3 flex justify-between items-center text-white">
                <span className="font-bold text-sm">LinkVault</span>
                <Search size={14}/>
             </div>
             <div className="p-2 space-y-2">
                <div className="text-xs font-bold text-slate-400 uppercase mt-2 mb-1">Recent Saves</div>
                <div className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer">
                   <Folder size={14} className="text-blue-500"/>
                   <div className="text-xs truncate">React Documentation</div>
                </div>
                <div className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer">
                   <Folder size={14} className="text-purple-500"/>
                   <div className="text-xs truncate">Design Inspiration 2024</div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </main>
  );
}
