import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './App.css'
import GamePage from './page/GamePage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GamePage />}></Route>
      </Routes>
    </BrowserRouter>
      
  )
}

export default App
