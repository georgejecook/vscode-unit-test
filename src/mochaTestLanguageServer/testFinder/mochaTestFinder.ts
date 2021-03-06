import * as ts from "typescript";
import * as fs from "fs-extra";
import * as path from "path";
import { MochaTestCase, SuiteItem, DescribeItem, ItItem, TestItem } from "./MochaTestCase";
import { TestCase } from "../../testLanguage/protocol";
import { PathUtils } from "../../utils/path"

export class MochaTestFinder {

    public static findTestCaseByFullTitle(fullTitle: string, testCases: Array<TestCase>): TestCase {
        return testCases.filter((testCase) => {
            return testCase.fullTitle === fullTitle;
        })[0];
    }

    public static copyTestCaseResults(newTestCase: TestCase, previousTestCase: TestCase): TestCase {
        if (previousTestCase) {
            newTestCase.id = previousTestCase.id;
            newTestCase.errorMessage = previousTestCase.errorMessage;
            newTestCase.errorStackTrace = previousTestCase.errorStackTrace;
            newTestCase.status = previousTestCase.status;
            newTestCase.startTime = previousTestCase.startTime;
            newTestCase.endTime = previousTestCase.endTime;
            newTestCase.sessionId = previousTestCase.sessionId;
            newTestCase.duration = previousTestCase.duration;
        }
        return newTestCase;
    }

    public static fillTestCase(newTestCase: TestCase, previousFileTestCases: Array<TestCase>): TestCase {
        const previousTestCase = MochaTestFinder.findTestCaseByFullTitle(newTestCase.fullTitle, previousFileTestCases);
        if (previousTestCase) {
            return MochaTestFinder.copyTestCaseResults(newTestCase, previousTestCase);
        }
        return newTestCase;
    }

    /**
     * Find test cases in the given file
     * @param filePath File path to search for test cases. The filepath must be a filed system path
     * otherwise a exception will be thrown.
     * @return Array of found test cases
     */
    public static findTestCases(filePath: string, previousFileTestCases: Array<TestCase>): Array<TestCase> {
        const textTestFile: string = fs.readFileSync(filePath).toString();
        const sourceFile: ts.SourceFile = ts.createSourceFile(
            filePath, textTestFile, ts.ScriptTarget.Latest, false, ts.ScriptKind.Unknown);

        let testCase = new TestCase();
        testCase.line = 0;

        testCase.path = PathUtils.normalizePath(sourceFile.fileName);
        testCase.title = path.basename(sourceFile.fileName);
        testCase.fullTitle = "";
        testCase.isTestCase = false;
        testCase.code = `${testCase.title}${testCase.path}`
        testCase.hasChildren = true;

        testCase = MochaTestFinder.fillTestCase(testCase, previousFileTestCases);

        let testCases = new Array<TestCase>();
        testCases.push(testCase);

        //return sourceFile.statements.map(statement => MochaTestFinder.visit(sourceFile, statement, null)).filter(o => o);
        sourceFile.statements.map(statement => MochaTestFinder.visit(sourceFile, statement, testCase, testCases, previousFileTestCases));

        if (testCases.length === 1) {
            testCases = new Array<TestCase>();
        }

        return testCases;
    }

    /**
     * Visit source file nodes to find mocha tests
     */
    private static visit(sourceFile: ts.SourceFile, node: ts.Node, parent: TestCase, testCases: Array<TestCase>, previousFileTestCases: Array<TestCase>): any {
        switch (node.kind) {
            case ts.SyntaxKind.ExpressionStatement: {
                const obj: ts.ExpressionStatement = node as ts.ExpressionStatement;
                return MochaTestFinder.visit(sourceFile, obj.expression, parent, testCases, previousFileTestCases);
            }

            case ts.SyntaxKind.CallExpression: {
                const obj: ts.CallExpression = node as ts.CallExpression;
                const name: string = MochaTestFinder.visit(sourceFile, obj.expression, null, testCases, previousFileTestCases);
                switch (name) {
                    case "suite": {
                        const pos: number = sourceFile.text.lastIndexOf("suite", obj.arguments[0].pos);


                        let result: TestCase = new SuiteItem();

                        result.line = sourceFile.getLineAndCharacterOfPosition(pos).line;

                        result.title = MochaTestFinder.visit(sourceFile, obj.arguments[0], null, testCases, previousFileTestCases);
                        const parentTitle = parent != null ? parent.fullTitle : null;
                        result.fullTitle = parentTitle ? parentTitle + " " + result.title : result.title;
                        //result.setChildren(children);
                        result.parentId = parent != null && parent.id;
                        result.path = PathUtils.normalizePath(sourceFile.fileName);

                        result.code = `${result.title}${result.path}`

                        result = MochaTestFinder.fillTestCase(result, previousFileTestCases);

                        let children: any = MochaTestFinder.visit(sourceFile, obj.arguments[1], result, testCases, previousFileTestCases);
                        if (!Array.isArray(children)) {
                            children = [children];
                        }
                        result.isTestCase = false;
                        result.hasChildren = children.length > 0;

                        testCases.push(result);

                        return result;
                    }

                    case "describe.skip":
                    case "describe": {
                        const pos: number = sourceFile.text.lastIndexOf("describe", obj.arguments[0].pos);


                        let result: TestCase = new DescribeItem();
                        result.line = sourceFile.getLineAndCharacterOfPosition(pos).line;

                        result.title = MochaTestFinder.visit(sourceFile, obj.arguments[0], null, testCases, previousFileTestCases);
                        const parentTitle = parent != null ? parent.fullTitle : null;
                        result.fullTitle = parentTitle ? parentTitle + " " + result.title : result.title;
                        //result.setChildren(children);
                        result.parentId = parent != null && parent.id;
                        result.path = PathUtils.normalizePath(sourceFile.fileName);
                        result.code = `${result.title}${result.path}`
                        result.isTestCase = false;

                        result = MochaTestFinder.fillTestCase(result, previousFileTestCases);

                        let children: any = MochaTestFinder.visit(sourceFile, obj.arguments[1], result, testCases, previousFileTestCases);
                        if (!Array.isArray(children)) {
                            children = [children];
                        }

                        result.hasChildren = children.length > 0;


                        testCases.push(result);

                        return result;
                    }

                    case "test":
                    case "test.skip":
                        const pos: number = sourceFile.text.lastIndexOf("test", obj.arguments[0].pos);

                        let result: TestCase = new TestItem();
                        result.line = sourceFile.getLineAndCharacterOfPosition(pos).line;

                        result.title = MochaTestFinder.visit(sourceFile, obj.arguments[0], null, testCases, previousFileTestCases);
                        const parentTitle = parent != null ? parent.fullTitle : null;
                        result.fullTitle = parentTitle ? parentTitle + " " + result.title : result.title;
                        result.path = PathUtils.normalizePath(sourceFile.fileName);
                        result.parentId = parent != null && parent.id;
                        result.code = `${result.title}${result.path}`
                        result.hasChildren = false;
                        result = MochaTestFinder.fillTestCase(result, previousFileTestCases);
                        testCases.push(result);

                        return result;
                    case "it.skip":
                    case "it": {
                        const pos: number = sourceFile.text.lastIndexOf("it", obj.arguments[0].pos);

                        let result: TestCase = new ItItem();
                        result.line = sourceFile.getLineAndCharacterOfPosition(pos).line;

                        result.title = MochaTestFinder.visit(sourceFile, obj.arguments[0], null, testCases, previousFileTestCases);
                        const parentTitle = parent != null ? parent.fullTitle : null;
                        result.fullTitle = parentTitle ? parentTitle + " " + result.title : result.title;
                        result.path = PathUtils.normalizePath(sourceFile.fileName);
                        result.parentId = parent != null && parent.id;
                        result.code = `${result.title}${result.path}`
                        result.hasChildren = false;
                        result = MochaTestFinder.fillTestCase(result, previousFileTestCases);
                        testCases.push(result);

                        return result;
                    }
                }

                return null;
            }

            case ts.SyntaxKind.ArrowFunction: {
                const obj: ts.ArrowFunction = node as ts.ArrowFunction;
                return MochaTestFinder.visit(sourceFile, obj.body, parent, testCases, previousFileTestCases);
            }

            case ts.SyntaxKind.Identifier: {
                const obj: ts.Identifier = node as ts.Identifier;
                return obj.text;
            }

            case ts.SyntaxKind.StringLiteral: {
                const obj: ts.StringLiteral = node as ts.StringLiteral;
                return obj.text;
            }

            case ts.SyntaxKind.FunctionExpression: {
                const obj: ts.FunctionExpression = node as ts.FunctionExpression;
                if (obj.parameters.length === 0) {
                    return MochaTestFinder.visit(sourceFile, obj.body, parent, testCases, previousFileTestCases);
                }

                break;
            }

            case ts.SyntaxKind.Block: {
                const obj: ts.Block = node as ts.Block;
                return obj.statements.map(statement => MochaTestFinder.visit(sourceFile, statement, parent, testCases, previousFileTestCases)).filter(o => o);
            }

            case ts.SyntaxKind.ImportDeclaration:
            case ts.SyntaxKind.VariableStatement:
                return null;
            case ts.SyntaxKind.PropertyAccessExpression: {
                const obj: ts.PropertyAccessExpression = node as ts.PropertyAccessExpression;
                return MochaTestFinder.visit(sourceFile, obj.expression, parent, testCases, previousFileTestCases) + "."
                    + MochaTestFinder.visit(sourceFile, obj.name, parent, testCases, previousFileTestCases);
            }
            case ts.SyntaxKind.FunctionDeclaration: {
                const obj: ts.FunctionDeclaration = node as ts.FunctionDeclaration;
                return null;
            }
            case ts.SyntaxKind.BinaryExpression: {
                const obj: ts.BinaryExpression = node as ts.BinaryExpression;
                const textLeft = <string>MochaTestFinder.visit(sourceFile, obj.left, parent, testCases, previousFileTestCases)
                const textRight = <string>MochaTestFinder.visit(sourceFile, obj.right, parent, testCases, previousFileTestCases);
                return textLeft + textRight
            }
            default: {
                //console.log(`Unresolved node: ${ts.SyntaxKind[node.kind]} - File ${sourceFile.fileName}`);
                return null;
            }
        }
    }
}