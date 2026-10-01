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

  it("keeps a lone * as written (arithmetic, operators)", () => {
    // evaluate-rpn's second example: the old rule turned `"* ... 3 *` into italics.
    const text = 'Then "*" multiplies the two: 3 * 4 = 12. Also 2*3*4, x ** 2 and (+, -, * or /).'
    const { container } = render(<Markdown text={text} />)
    expect(container.querySelector("em")).toBeNull()
    expect(container.querySelector("strong")).toBeNull()
    expect(container.textContent).toBe(text)
  })

  it("needs emphasis markers to hug their text", () => {
    const { container } = render(<Markdown text={"a * b * c, ** d **, *e*, **f**"} />)
    expect([...container.querySelectorAll("em")].map((node) => node.textContent)).toEqual(["e"])
    expect([...container.querySelectorAll("strong")].map((node) => node.textContent)).toEqual(["f"])
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
