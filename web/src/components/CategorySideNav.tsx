import { NavLink, useParams } from "react-router";
import Trophy from "./Trophy";
import { EVENT_CATEGORIES, EventCategory, DEFAULT_CATEGORY_SLUG } from "./eventCategories";
import "./CategorySideNav.css";

type Props = {
  basePath: string;
  categories?: EventCategory[];
  showPrivate?: boolean;
  showHostEvent?: boolean;
  highlightDefault?: boolean;
};

export default function CategorySideNav({
  basePath,
  categories = EVENT_CATEGORIES,
  showPrivate,
  showHostEvent,
  highlightDefault,
}: Props) {
  const { category } = useParams<{ category?: string }>();
  const effectiveCategory = category ?? (highlightDefault ? DEFAULT_CATEGORY_SLUG : undefined);
  return (
    <aside className="category-side-nav">
      <ul>
        {categories.map(cat => (
          <li key={cat.slug}>
            <NavLink
              to={`${basePath}/${cat.slug}`}
              className={({ isActive }) =>
                "cat-item" + (isActive || effectiveCategory === cat.slug ? " active" : "")
              }
            >
              <Trophy mode={cat.mode} style={{ width: 22, height: 22 }} />
              <span>{cat.label}</span>
            </NavLink>
          </li>
        ))}
        {showPrivate && (
          <li className="separator">
            <NavLink
              to="/events/private"
              className={({ isActive }) => "cat-item" + (isActive ? " active" : "")}
            >
              <Trophy private style={{ width: 22, height: 22 }} />
              <span>Private</span>
            </NavLink>
          </li>
        )}
        {showHostEvent && (
          <li className="action">
            <NavLink to="/events/0/edit" className="cat-item host-event">
              <span className="plus">+</span>
              <span>Host<span className="label-suffix"> Event</span></span>
            </NavLink>
          </li>
        )}
      </ul>
    </aside>
  );
}
