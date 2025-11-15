import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './App.css'
import GamePage from './page/GamePage'
import { TestPage } from './page/TestPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GamePage />}></Route>
        <Route path="/test" element={<TestPage />}></Route>
      </Routes>
    </BrowserRouter>
      
  )
}

export default App
