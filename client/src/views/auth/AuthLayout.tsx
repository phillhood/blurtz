import React from "react";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

const HUES = ["red", "blue", "yellow", "green"] as const;
const FACES = [7, 4, 9, 2];

const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children }) => {
  return (
    <div className="blurtz-auth">
      <aside className="blurtz-auth__brand">
        <div>
          <div className="blurtz-auth__mark">Blurtz!</div>
          <p className="blurtz-auth__pitch">Nertz, in real time</p>
          <p className="blurtz-auth__blurb">
            Everybody plays at once, nobody waits for a turn, and the foundations
            belong to whoever gets there first.
          </p>
        </div>
        <div className="blurtz-auth__fan" aria-hidden="true">
          {HUES.map((hue, index) => (
            <div
              key={hue}
              className="blurtz-auth__card"
              style={{ ["--hue" as string]: `var(--color-card-${hue})` }}
            >
              {FACES[index]}
            </div>
          ))}
        </div>
      </aside>

      <main className="blurtz-auth__form">
        <h2 className="blurtz-auth__title">{title}</h2>
        <p className="blurtz-auth__subtitle">{subtitle}</p>
        {children}
      </main>
    </div>
  );
};

export default AuthLayout;
