import Food from "./components/Food";
import Swords from "./components/Swords";
import Trophy from "./components/Trophy";
import "./Home.css"

export default function Home() {
  return (
    <>
      <section style={{ maxWidth: '500px', margin: '0 auto' }}>
        <div style={{ margin: '1.5rem 0' }}>
          <p>
            Welcome to <strong>Valheim Help</strong> where you can find tools and information to help
            you enjoy gaming in Valheim. Our goal is to get you info fast without
            distractions.
          </p>

          <p>
            This website is open-source and accepts contributions on <a
              href="https://github.com/jarrettv/valheim-help">Github</a
            >. If you find mistakes or want improvements, please consider
            contributing to the project with a pull request.
          </p>

          <p>
            If you find the project useful, consider <a
              href="https://github.com/sponsors/jarrettv">becoming a sponsor.</a>
          </p>
        </div>
      </section>
      <nav>
        <a href="/trophy/calc">
          <Trophy style={{ verticalAlign: "middle", marginTop: "-0.3rem", width: "1.8rem" }} />
          Trophy Hunt Calculator
        </a>
        <a href="/trophy/tracker">
          <Trophy style={{ verticalAlign: "middle", marginTop: "-0.3rem", width: "1.8rem" }} />
          Trophy Hunt Tracker
        </a>
        <a href="/gear">
          <Swords style={{ verticalAlign: "middle", marginTop: "-0.3rem", width: "1.8rem" }} />
          Gear <small>Weapons &amp; Armor Info</small>
        </a>
        <a href="/food">
          <Food style={{ verticalAlign: "middle", marginTop: "-0.3rem", width: "1.8rem" }} />
          Food <small>Recipes &amp; Stats</small>
        </a>
      </nav></>
  )
}