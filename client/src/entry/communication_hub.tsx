import React from 'react'
import { createRoot } from 'react-dom/client'
import CommunicationHub from '../components/communication/CommunicationHub'
import '../index.css'

const rootElement = document.getElementById('react-root')
if (!rootElement) throw new Error('Failed to find the root element')

const root = createRoot(rootElement)

root.render(
  <React.StrictMode>
    <CommunicationHub />
  </React.StrictMode>,
)