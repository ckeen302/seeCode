import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Markdown } from "@/components/workspace/Markdown"

describe("problem Markdown (Section 7.2)", () => {
  it("renders paragraphs, inline code, bold and italic", () => {
    const { container } = render(
      <Markdown
        text={"You get a string `s`. Return **true** if *any* match.\n\nSecond paragraph."}
      />
    )
    expect(container.querySelectorAll("p")).toHaveLength(2)
    expect(screen.getByText("s").tagName).toBe("CODE")
    expect(screen.getByText("true").tagName).toBe("STRONG")
    expect(screen.getByText("any").tagName).toBe("EM")
  })

  it("renders dash lists", () => {
    const { container } = render(<Markdown text={"- one `a`\n- two"} />)
    expect(container.querySelectorAll("li")).toHaveLength(2)
  })

  it("never renders HTML from the text", () => {
    const { container } = render(<Markdown text={'<img src=x onerror="alert(1)"> `<b>`'} />)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("b")).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">')
  })
})
